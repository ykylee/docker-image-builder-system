<script lang="ts">
  import { link } from "svelte-spa-router";
</script>

<section class="nf">
  <h1>404</h1>
  <p>That page does not exist.</p>
  <a use:link href="/">Back to builds</a>
</section>

<style>
  .nf { display: flex; flex-direction: column; gap: var(--space-md); align-items: flex-start; }
</style>
