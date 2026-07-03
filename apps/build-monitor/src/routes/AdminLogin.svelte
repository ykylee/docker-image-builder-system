<script lang="ts">
  import { push } from "svelte-spa-router";
  import { onMount } from "svelte";

  import { adminIdStore } from "../lib/session.js";

  let adminId = $state("");
  let currentAdminId = $derived($adminIdStore);

  // Admin login is separate from the user login flow. The admin id is
  // stored under a distinct localStorage key (`adminId`) so the regular
  // build monitor session is not disturbed, and so the regular user
  // login (in Login.svelte) cannot accidentally satisfy the admin guard.
  // Backend authorization is the source of truth: ADMIN_IDS in the
  // build-server env decides who can call /admin/*.
  onMount(() => {
    if (currentAdminId) {
      // Auto-forward to /admin/builds only after the user has already
      // signed in once this session. The backend still re-checks the
      // header on every request.
      push("/admin/builds");
    }
  });

  function login(e: Event) {
    e.preventDefault();
    const value = adminId.trim();
    if (value) {
      // Bug 1: session store 경유로 set 해서 같은 탭의 Header 가
      // 로그인 직후 admin pill / nav link 를 즉시 표시하도록 한다.
      adminIdStore.set(value);
      push("/admin/builds");
    }
  }
</script>

<section class="admin-login">
  <div class="card">
    <div class="logo-wrapper">
      <span class="logo" aria-hidden="true">⬢</span>
    </div>
    <h1>Admin Sign-in</h1>
    <p class="subtitle">
      Enter your admin id to manage every build and review user activity.
    </p>
    <form onsubmit={login}>
      <div class="input-group">
        <label for="adminId">Admin ID</label>
        <input
          id="adminId"
          type="text"
          bind:value={adminId}
          placeholder="admin"
          required
        />
      </div>
      <button type="submit" class="btn-primary">Enter Admin</button>
    </form>
    <p class="muted small">
      The default admin ids are <code>admin</code> and <code>yky.lee</code>.
      Operators can override the allow-list via the <code>ADMIN_IDS</code>
      env on the build server.
    </p>
  </div>
</section>

<style>
  .admin-login {
    display: flex;
    align-items: center;
    justify-content: center;
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
  .logo { color: white; font-size: var(--size-xxl); line-height: 1; }
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
    /* TASK-046 follow-up: light 모드 --color-border-strong 을
       #cbd5e1 (1.36:1) → #7a889e (3.28:1) 로 올림. Login input 의 흐릿
       한 border 가 토큰 한 곳에서 해결됨. color-scheme: light 가 적용
       되면 webkit native input border 가 사라지므로 우리 border 가
       살아남는다. */
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
  .btn-primary:active { transform: translateY(0); }
  .muted {
    color: var(--color-text-muted);
    margin-top: var(--space-lg);
  }
  .small { font-size: var(--size-xs); }
  code {
    background: var(--color-bg-surface-elevated);
    padding: 0 4px;
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 0.9em;
  }
</style>
