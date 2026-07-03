<script lang="ts">
  import { push } from "svelte-spa-router";
  import { onMount } from "svelte";

  import { userIdStore } from "../lib/session.js";

  let userId = $state("");
  // currentUserId 는 store 와 동기화 — 이미 로그인된 상태에서 진입하면
  // 입력 칸에 현재 id 를 채워서 보여준다.
  let currentUserId = $derived($userIdStore);

  onMount(() => {
    if (currentUserId) {
      push("/builds");
    }
  });

  function login(e: Event) {
    e.preventDefault();
    const value = userId.trim();
    if (value) {
      // session store 가 localStorage 도 같이 쓴다. 같은 탭에서 Header
      // 가 즉시 갱신되도록 writable store 경유 (Bug 1).
      userIdStore.set(value);
      push("/builds");
    }
  }
</script>

<section class="login-page">
  <div class="card">
    <div class="logo-wrapper">
      <span class="logo" aria-hidden="true">⬢</span>
    </div>
    <h1>Welcome to Build Monitor</h1>
    <p class="subtitle">Enter your user ID to view your builds.</p>
    
    <form onsubmit={login}>
      <div class="input-group">
        <label for="userId">User ID</label>
        <input
          id="userId"
          type="text"
          bind:value={userId}
          placeholder="your-id"
          required
        />
      </div>
      <button type="submit" class="btn-primary">Enter</button>
    </form>
  </div>
</section>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    /* header (64) + main padding-top (space-lg) + main padding-bottom (space-lg) */
    min-height: calc(100vh - 64px - var(--space-lg) * 2);
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .card {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    padding: var(--space-xxl);
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .logo-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-info));
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    margin-bottom: var(--space-lg);
  }
  .logo {
    color: white;
    font-size: var(--size-xxl);
    line-height: 1;
  }
  h1 {
    margin: 0 0 var(--space-xs);
    font-size: var(--size-xl);
    color: var(--color-text-primary);
  }
  .subtitle {
    margin: 0 0 var(--space-xl);
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
  }
  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  .input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    text-align: left;
  }
  label {
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  input {
    width: 100%;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-canvas);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: var(--size-md);
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px var(--color-focus-ring);
  }
  .btn-primary {
    width: 100%;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-accent-primary);
    color: white;
    font-size: var(--size-md);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-primary:hover {
    background: var(--color-accent-primary-hover);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    transform: translateY(-1px);
  }
  .btn-primary:active {
    transform: translateY(0);
  }
</style>
