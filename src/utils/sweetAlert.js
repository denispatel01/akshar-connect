import Swal from 'sweetalert2';

const base = {
  confirmButtonColor: '#003158',
  confirmButtonText: 'OK',
  customClass: { popup: 'rounded-3xl font-sans' },
};

export function alertDevoteeSaved(name) {
  return Swal.fire({
    ...base,
    icon: 'success',
    title: 'Saved',
    text: name ? `${name}'s profile was updated successfully.` : 'Devotee profile was updated successfully.',
    timer: 2800,
    showConfirmButton: true,
  });
}

export function alertDevoteeCreated(name) {
  return Swal.fire({
    ...base,
    icon: 'success',
    title: 'Devotee added',
    text: name ? `${name} was added to the directory.` : 'New devotee was added successfully.',
    timer: 2800,
    showConfirmButton: true,
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
