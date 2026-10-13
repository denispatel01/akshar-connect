import Swal from 'sweetalert2';

// Shared SweetAlert look — orange brand button, rounded, closes on OK (#102).
const base = {
  confirmButtonColor: '#E56F18',
  confirmButtonText: 'OK',
  buttonsStyling: true,
  customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold' },
};

// Generic helpers — use anywhere for a centered success/error popup.
export function alertSuccess(title, text) {
  return Swal.fire({ ...base, icon: 'success', title, text });
}
export function alertError(title, text) {
  return Swal.fire({ ...base, icon: 'error', title, text: text || 'Something went wrong. Please try again.' });
}

// Plain info popup (replaces window.alert) — awaitable.
export function alertInfo(title, text) {
  return Swal.fire({ ...base, icon: 'info', title, text });
}

// Confirmation popup (replaces window.confirm). Resolves true if confirmed.
// `danger: true` paints the confirm button red for destructive actions (delete).
export async function confirmDialog({ title = 'Are you sure?', text = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = danger ? 'warning' : 'question' } = {}) {
  const res = await Swal.fire({
    ...base,
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? '#DC2626' : base.confirmButtonColor,
    cancelButtonColor: '#94A3B8',
    reverseButtons: true,
    customClass: {
      popup: 'rounded-3xl font-sans',
      confirmButton: 'rounded-2xl px-6 py-2.5 font-bold',
      cancelButton: 'rounded-2xl px-6 py-2.5 font-bold',
    },
  });
  return res.isConfirmed;
}

export function alertDevoteeSaved(name) {
  return Swal.fire({
    ...base,
    icon: 'success',
    title: 'Saved',
    text: name ? `${name}'s profile was updated successfully.` : 'Devotee profile was updated successfully.',
  });
}

export function alertDevoteeCreated(name) {
  return Swal.fire({
    ...base,
    icon: 'success',
    title: 'Devotee added',
    text: name ? `${name} was added to the directory.` : 'New devotee was added successfully.',
  });
}

export function alertDevoteeSaveFailed(message) {
  return Swal.fire({
    ...base,
    icon: 'error',
    title: 'Could not save',
    text: message || 'Something went wrong while saving. Please try again.',
  });
}
