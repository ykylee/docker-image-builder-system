<script lang="ts">
  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import Login from "./routes/Login.svelte";
  import BuildsList from "./routes/BuildsList.svelte";
  import BuildDetail from "./routes/BuildDetail.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Login,
    "/builds": BuildsList,
    "/builds/:buildId": BuildDetail,
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
