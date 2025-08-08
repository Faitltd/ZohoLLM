<script>
  import { onMount } from 'svelte';
  let entities = { leads: [], deals: [], companies: [], totals: { documents: 0 } };
  let loading = true;

  onMount(async () => {
    const res = await fetch('/api/entities');
    entities = await res.json();
    loading = false;
  });
</script>

<main>
  <h1>CRM Entities</h1>
  {#if loading}
    <p>Loading...</p>
  {:else}
    <p>Total documents: {entities.totals.documents}</p>
    <div class="grid">
      <section>
        <h2>Leads</h2>
        <ul>{#each entities.leads as l}<li>{l}</li>{/each}</ul>
      </section>
      <section>
        <h2>Deals</h2>
        <ul>{#each entities.deals as d}<li>{d}</li>{/each}</ul>
      </section>
      <section>
        <h2>Companies</h2>
        <ul>{#each entities.companies as c}<li>{c}</li>{/each}</ul>
      </section>
    </div>
  {/if}
</main>

<style>
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  h1 { margin: 16px 0; }
  section { border: 1px solid #ddd; padding: 12px; border-radius: 8px; background: #fff; }
</style>

