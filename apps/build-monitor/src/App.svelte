<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Login from "./routes/Login.svelte";
  import BuildsList from "./routes/BuildsList.svelte";
  import BuildDetail from "./routes/BuildDetail.svelte";
  import AdminLogin from "./routes/AdminLogin.svelte";
  import AdminBuilds from "./routes/AdminBuilds.svelte";
  import AdminUsers from "./routes/AdminUsers.svelte";
  import AdminAdmins from "./routes/AdminAdmins.svelte";
  import AdminRunners from "./routes/AdminRunners.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Login,
    "/builds": BuildsList,
    "/builds/:buildId": BuildDetail,
    // Admin routes (ADMIN-007). Each admin route reads the adminId
    // from a distinct localStorage key; the user-facing Login / Header
    // does not satisfy the admin guard. TASK-069 adds /admin/runners
    // for runner registry management (list / DISABLE / DELETE).
    "/admin/login": AdminLogin,
    "/admin/builds": AdminBuilds,
    "/admin/users": AdminUsers,
    "/admin/admins": AdminAdmins,
    "/admin/runners": AdminRunners,
    "*": NotFound
  };
</script>

<Header />
<main>
  <Router {routes} />
</main>

<style>
  main {
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--space-lg) var(--space-xl);
  }
</style>
