/**
 * OB-30 Reconciliation Loader
 * Run this in browser console - it will fetch and execute the full script
 */
(async function() {
  const gtData = await fetch('/api/ground-truth').catch(() => null);
  if (!gtData) {
    // Fallback: load from localStorage if API not available
    const stored = localStorage.getItem('__GT_DATA');
    if (stored) {
      window.__GT_DATA = JSON.parse(stored);
      console.log('Loaded ground truth from localStorage');
    } else {
      console.error('Ground truth data not available. Run the Node script first.');
      return;
    }
  }
  console.log('Ready for reconciliation');
})();
