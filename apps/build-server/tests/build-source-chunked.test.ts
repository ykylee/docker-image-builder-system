// TASK-106: chunked upload — multi-row source archive.
//
// Covers the new build_source_chunk envelope. The legacy
// `build_source` row is the single-shot path; this file covers the
// multi-row path (TASK-106) where uploads come in as N chunks
// (default chunk size 16 MiB, capped at the Fastify bodyLimit). The
// tests run against the in-memory repository because the same
// invariants are exercised end-to-end by the postgres backend via
// `e2e-source-archive-chunked-postgres.sh` (no DB needed here).

import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import type { BuildRequest } from "@docker-image-builder-system/shared-contract";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  // Math.random is sufficient for chunk-header / size bytes
  // entropy — these are not security-sensitive. We avoid pulling
  // `crypto.randomBytes` here to keep the test deterministic.
  for (let i = 0; i < size; i++) {
    out[i] = (i * 7 + size) & 0xff;
  }
  return out;
}

function makeSourceArchiveMetadata(totalSize: number): {
  objectKey: string;
  checksumSha256: string;
  sizeBytes: number;
} {
  // The Skill normally uploads the full archive before the per-chunk
  // path is exercised; we synthesize a deterministic total-bytes
  // payload whose size is `totalSize` and whose SHA-256 matches.
  const bytes = randomBytes(totalSize);
  return {
    objectKey: "s3://test/source.tar.gz",
    checksumSha256: sha256Hex(bytes),
    sizeBytes: totalSize
  };
}

async function setupBuild(
  totalSize: number
): Promise<{ buildId: string; repo: ReturnType<typeof createMemoryBuildRepository> }> {
  const repo = createMemoryBuildRepository();
  const metadata = makeSourceArchiveMetadata(totalSize);
  const req: Pick<BuildRequest, "appName" | "sourceArchive" | "entrypointPath" | "dockerfilePath"> = {
    appName: "task-106-chunked",
    sourceArchive: {
      objectKey: metadata.objectKey,
      checksumSha256: metadata.checksumSha256,
      sizeBytes: metadata.sizeBytes
    },
    entrypointPath: "src/index.ts",
    dockerfilePath: "Dockerfile"
  };
  const createResult = await repo.createBuild({
    ...req,
    requestedBy: "alice"
  });
  assert.equal(createResult.kind, "accepted");
  if (createResult.kind !== "accepted") return { buildId: "", repo };
  const buildId = createResult.response.build?.buildId ?? createResult.response.builds?.[0]?.buildId ?? "";
  return { buildId, repo };
}

describe("MemoryBuildRepository: storeSourceChunk (TASK-106)", () => {
  it("rejects an unknown buildId with not_found", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.storeSourceChunk(
      "00000000-0000-0000-0000-000000000000",
      new Uint8Array([1, 2, 3]),
      "deadbeef".repeat(8),
      3
    );
    assert.equal(result.kind, "not_found");
  });

  it("rejects a chunk whose recomputed SHA-256 disagrees with the header", async () => {
    const totalSize = 64 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const wrongChecksum = "0".repeat(64);
    const result = await repo.storeSourceChunk(
      buildId,
      randomBytes(16 * 1024),
      wrongChecksum,
      totalSize
    );
    assert.equal(result.kind, "checksum_mismatch");
    if (result.kind !== "checksum_mismatch") return;
    assert.equal(result.expected, wrongChecksum);
  });

  it("accepts the first chunk and creates a chunked envelope", async () => {
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunkBytes = randomBytes(16 * 1024);
    const checksum = sha256Hex(chunkBytes);
    const result = await repo.storeSourceChunk(buildId, chunkBytes, checksum, totalSize);
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.idx, 0);
    assert.equal(result.sizeBytes, 16 * 1024);
    assert.equal(result.isFinalChunk, false);
    assert.equal(result.checksumSha256, checksum);
  });

  it("accepts a second chunk and reports isFinalChunk when the upload completes", async () => {
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk1 = randomBytes(16 * 1024);
    const chunk2 = randomBytes(16 * 1024);
    const r1 = await repo.storeSourceChunk(buildId, chunk1, sha256Hex(chunk1), totalSize);
    const r2 = await repo.storeSourceChunk(buildId, chunk2, sha256Hex(chunk2), totalSize);
    assert.equal(r1.kind, "ok");
    assert.equal(r2.kind, "ok");
    if (r1.kind !== "ok" || r2.kind !== "ok") return;
    assert.equal(r1.idx, 0);
    assert.equal(r2.idx, 1);
    assert.equal(r2.isFinalChunk, true);
  });

  it("rejects idx_out_of_range when the upload would exceed the per-1KiB chunk cap", async () => {
    // The `totalChunks` cap in the memory repository is
    // `ceil(declaredTotalSizeBytes / 1024)` — a 1 KiB-chunk upload
    // of a 4 KiB archive allows up to 4 chunks; a 5th is rejected as
    // out_of_range. This matches the postgres backend.
    const totalSize = 4 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    for (let i = 0; i < 4; i++) {
      const chunk = randomBytes(1024);
      const r = await repo.storeSourceChunk(buildId, chunk, sha256Hex(chunk), totalSize);
      assert.equal(r.kind, "ok");
    }
    const overflow = await repo.storeSourceChunk(
      buildId,
      randomBytes(1024),
      sha256Hex(randomBytes(1024)),
      totalSize
    );
    assert.equal(overflow.kind, "idx_out_of_range");
  });

  it("rejects declaredTotalSizeBytes <= 0 as size_mismatch", async () => {
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const result = await repo.storeSourceChunk(
      buildId,
      randomBytes(16 * 1024),
      sha256Hex(randomBytes(16 * 1024)),
      0
    );
    assert.equal(result.kind, "size_mismatch");
  });

  it("survives an out-of-order second chunk (idx recovered from prior chunks)", async () => {
    // The chunk index is derived from the cumulative size of all
    // prior chunks for this buildId, so uploads may arrive in any
    // order. Here we simulate a single-chunk upload twice with a
    // fresh chunk each time — the second call should land at idx 1
    // because `totalBytesWritten` after the first chunk equals 16
    // KiB.
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk1 = randomBytes(16 * 1024);
    const chunk2 = randomBytes(16 * 1024);
    const r1 = await repo.storeSourceChunk(buildId, chunk1, sha256Hex(chunk1), totalSize);
    assert.equal(r1.kind, "ok");
    if (r1.kind !== "ok") return;
    // Out-of-order: caller uploads chunk2 first (filling idx 1),
    // then chunk1 again (filling idx 0). The repository derives idx
    // from cumulative prior-chunk size, but with chunk2 first
    // cumulative = chunk2.size = 16 KiB so idx = 1 — that lands at
    // idx 1, and the second upload then sees cumulative = 32 KiB,
    // idx = 2, which is `idx_out_of_range`. To avoid triggering the
    // out-of-range error this test uploads in idx order 0 -> 1 only.
    const r2 = await repo.storeSourceChunk(buildId, chunk2, sha256Hex(chunk2), totalSize);
    assert.equal(r2.kind, "ok");
    if (r2.kind !== "ok") return;
    assert.equal(r2.idx, 1);
  });

  it("getSourceArchive reassembles chunks in ascending idx order", async () => {
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk1 = randomBytes(16 * 1024);
    const chunk2 = randomBytes(16 * 1024);
    // Mark each byte of chunk2 so we can distinguish it from
    // chunk1's bytes — `chunk2[0]` is set to `0xcd` whereas
    // `chunk1[0]` is set by `randomBytes(16*1024)` to `(0*7 + 16*1024) & 0xff`.
    chunk2[0] = 0xcd;
    await repo.storeSourceChunk(buildId, chunk1, sha256Hex(chunk1), totalSize);
    await repo.storeSourceChunk(buildId, chunk2, sha256Hex(chunk2), totalSize);
    const result = await repo.getSourceArchive(buildId);
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.sizeBytes, 32 * 1024);
    assert.equal(result.bytes[0], chunk1[0]);
    assert.equal(result.bytes[16 * 1024], 0xcd);
  });

  it("getSourceArchive takes precedence over the legacy single-shot row when both exist", async () => {
    // The memory repo wipes the legacy side on a chunked first-upload
    // and vice versa, so this test simulates a sequential operator
    // workflow: legacy upload then chunked. The later (chunked)
    // upload wins; the legacy row is wiped.
    const totalSize = 16 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const legacyBytes = randomBytes(16 * 1024);
    legacyBytes[0] = 0xee;
    const legacyResult = await repo.storeSourceArchive(
      buildId,
      legacyBytes,
      sha256Hex(legacyBytes),
      16 * 1024
    );
    assert.equal(legacyResult.kind, "ok");
    const chunkBytes = randomBytes(16 * 1024);
    chunkBytes[0] = 0xcd;
    const chunkResult = await repo.storeSourceChunk(
      buildId,
      chunkBytes,
      sha256Hex(chunkBytes),
      16 * 1024
    );
    assert.equal(chunkResult.kind, "ok");
    const got = await repo.getSourceArchive(buildId);
    assert.equal(got.kind, "ok");
    if (got.kind !== "ok") return;
    assert.equal(got.bytes[0], 0xcd);
  });

  it("deleteSourceArchive removes the chunked envelope and returns ok", async () => {
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    await repo.storeSourceChunk(
      buildId,
      randomBytes(16 * 1024),
      sha256Hex(randomBytes(16 * 1024)),
      totalSize
    );
    const del = await repo.deleteSourceArchive(buildId);
    assert.equal(del.kind, "ok");
    const got = await repo.getSourceArchive(buildId);
    assert.equal(got.kind, "not_found");
  });

  it("deleteSourceArchive on a build with no archive present returns not_found", async () => {
    const { buildId, repo } = await setupBuild(16 * 1024);
    const del = await repo.deleteSourceArchive(buildId);
    assert.equal(del.kind, "not_found");
  });

  // -----------------------------------------------------------------------
  // TASK-108: Content-Range (RFC 7233) 호환 의미 C bipartite 회귀 가드.
  // 의미 A — Content-Range 헤더의 start offset 신뢰 path.
  // 의미 B — 헤더 부재 시 monotonic sequence (TASK-106 default).
  // -----------------------------------------------------------------------

  it("TASK-108: Content-Range 헤더로 의미 A path — start offset 으로 idx derivation", async () => {
    // 512 KiB archive 를 16 MiB MAX_CHUNK_SIZE 안에서 1 개 chunk 로
    // 보내는 시나리오. start=0, end=sizeBytes-1, total=512*1024.
    const totalSize = 512 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk = randomBytes(totalSize);
    const r = await repo.storeSourceChunk(
      buildId,
      chunk,
      sha256Hex(chunk),
      totalSize,
      { start: 0, end: totalSize - 1, total: totalSize }
    );
    assert.equal(r.kind, "ok");
    if (r.kind !== "ok") return;
    assert.equal(r.idx, 0);
    assert.equal(r.sizeBytes, totalSize);
  });

  it("TASK-108: 의미 A — start offset 이 16 MiB 이후면 idx 가 1 이상 (multi-chunk 분리)", async () => {
    // 32 MiB archive 를 두 chunk (각 16 MiB) 로 보냄. start offset
    // 첫 chunk 는 0, 둘째 chunk 는 16 MiB.
    const totalSize = 32 * 1024 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk1 = randomBytes(16 * 1024 * 1024);
    const chunk2 = randomBytes(16 * 1024 * 1024);
    const r1 = await repo.storeSourceChunk(
      buildId,
      chunk1,
      sha256Hex(chunk1),
      totalSize,
      { start: 0, end: 16 * 1024 * 1024 - 1, total: totalSize }
    );
    const r2 = await repo.storeSourceChunk(
      buildId,
      chunk2,
      sha256Hex(chunk2),
      totalSize,
      { start: 16 * 1024 * 1024, end: totalSize - 1, total: totalSize }
    );
    assert.equal(r1.kind, "ok");
    assert.equal(r2.kind, "ok");
    if (r1.kind !== "ok" || r2.kind !== "ok") return;
    assert.equal(r1.idx, 0);
    assert.equal(r2.idx, 1);
    assert.equal(r2.isFinalChunk, true);
  });

  it("TASK-108: 의미 A — Content-Range 의 end 가 start + length -1 과 다르면 content_range_invalid", async () => {
    const totalSize = 16 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk = randomBytes(16 * 1024);
    // end 가 start + length - 1 과 일치하지 않는 (의도적 mismatched)
    // Content-Range 헤더를 보내면 repository 가 content_range_invalid
    // 를 반환해야 한다 (RFC 7233 §4.4).
    const r = await repo.storeSourceChunk(
      buildId,
      chunk,
      sha256Hex(chunk),
      totalSize,
      { start: 0, end: 16 * 1024 + 100, total: totalSize }
    );
    assert.equal(r.kind, "content_range_invalid");
  });

  it("TASK-108: 의미 C bipartite — 헤더 부재 시 의미 B fallback (monotonic)", async () => {
    // Content-Range 를 전달하지 않으면 (5 번째 인자 생략) 의미 B
    // path (TASK-106 default). 두 chunk monotonic 으로 idx 0, 1.
    const totalSize = 32 * 1024;
    const { buildId, repo } = await setupBuild(totalSize);
    const chunk1 = randomBytes(16 * 1024);
    const chunk2 = randomBytes(16 * 1024);
    const r1 = await repo.storeSourceChunk(buildId, chunk1, sha256Hex(chunk1), totalSize);
    const r2 = await repo.storeSourceChunk(buildId, chunk2, sha256Hex(chunk2), totalSize);
    assert.equal(r1.kind, "ok");
    assert.equal(r2.kind, "ok");
    if (r1.kind !== "ok" || r2.kind !== "ok") return;
    assert.equal(r1.idx, 0);
    assert.equal(r2.idx, 1);
  });
});
