// src/main.ts
import { processInput } from './tool.ts';
import { initTheme } from './theme.ts';
import { initModals } from './modals.ts';
import { showToast } from './toast.ts';
import { auditCookies } from './cookies.ts';
import { auditVault } from './vault.ts';

let currentOutput = '';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderOutput(content: string, isError = false): void {
  const outputRegion = document.getElementById('output-region');
  if (!outputRegion) return;
  
  if (isError) {
    outputRegion.innerHTML = `<pre class="error"><code>${escapeHtml(content)}</code></pre>`;
  } else {
    outputRegion.innerHTML = `<pre><code>${escapeHtml(content)}</code></pre>`;
  }
}

function clearOutput(): void {
  const outputRegion = document.getElementById('output-region');
  if (outputRegion) {
    outputRegion.innerHTML = '<p class="placeholder">Output will appear here...</p>';
  }
  currentOutput = '';
}

async function handleProcess(): Promise<void> {
  const inputEl = document.getElementById('app-input') as HTMLTextAreaElement;
  if (!inputEl) return;
  
  const input = inputEl.value.trim();
  if (!input) {
    showToast('Please enter input');
    return;
  }

  const processBtn = document.getElementById('action-process') as HTMLButtonElement;
  if (processBtn) {
    processBtn.disabled = true;
    processBtn.textContent = 'Converting...';
  }

  try {
    const res = await processInput(input);
    
    if (res.success) {
      currentOutput = res.data;
      renderOutput(res.data);
      
      if (res.warnings && res.warnings.length > 0) {
        const warningText = res.warnings.join('\n');
        showToast('Warnings: ' + warningText);
      } else {
        showToast('Completed successfully!');
      }
    } else {
      currentOutput = '';
      renderOutput(res.error || 'Processing failed', true);
      showToast('Error: ' + (res.error || 'Processing failed'));
    }
  } catch (err) {
    currentOutput = '';
    const msg = err instanceof Error ? err.message : 'Unknown error';
    renderOutput(msg, true);
    showToast('Error: ' + msg);
  } finally {
    if (processBtn) {
      processBtn.disabled = false;
      processBtn.textContent = 'Convert';
    }
  }
}

function handleClear(): void {
  const inputEl = document.getElementById('app-input') as HTMLTextAreaElement;
  if (inputEl) {
    inputEl.value = '';
  }
  clearOutput();
  showToast('Cleared');
}

async function handleCopy(): Promise<void> {
  if (!currentOutput) {
    showToast('Nothing to copy');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(currentOutput);
    showToast('Copied to clipboard!');
  } catch {
    showToast('Failed to copy');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initModals();
  auditCookies();
  auditVault();

  const processBtn = document.getElementById('action-process') as HTMLButtonElement;
  const clearBtn = document.getElementById('action-clear') as HTMLButtonElement;
  const copyBtn = document.getElementById('action-copy') as HTMLButtonElement;

  if (processBtn) processBtn.addEventListener('click', handleProcess);
  if (clearBtn) clearBtn.addEventListener('click', handleClear);
  if (copyBtn) copyBtn.addEventListener('click', handleCopy);

  // Drag and drop support
  const inputEl = document.getElementById('app-input') as HTMLTextAreaElement;
  const dropZone = document.getElementById('drop-zone');
  
  if (dropZone && inputEl) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('drag-over');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            inputEl.value = event.target?.result as string || '';
            handleProcess();
          };
          reader.readAsDataURL(file);
        } else {
          showToast('Please drop an image file');
        }
      }
    }, false);
  }

  clearOutput();
});
