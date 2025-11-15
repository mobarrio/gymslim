// Fichero: /public/js/main.js (Versión India - FINAL)

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Lógica de Utilidad ---
    
    // Helper para mostrar notificaciones
    const toastElement = document.getElementById('notification-toast');
    const messageElement = document.getElementById('notification-message');
    let toastTimeout;

    function showNotification(message, isError = false) { 
        if (toastTimeout) clearTimeout(toastTimeout);
        
        if (!toastElement || !messageElement) {
          console.log("Toast (fallback):", message);
          return;
        }

        messageElement.textContent = message;
        toastElement.classList.remove('error', 'hidden');
        if (isError) {
            toastElement.classList.add('error');
        }

        toastTimeout = setTimeout(() => {
            toastElement.classList.add('hidden');
        }, 4000);
    }
    
    // Función de cierre de modal MFA (siempre necesaria)
    const mfaModal = document.getElementById('mfa-modal');
    const mfaManualKeyDiv = document.getElementById('mfa-manual-key');
    const mfaTokenInput = document.getElementById('mfa-token-input');
    const mfaPasswordInput = document.getElementById('mfa-password-input');
    const mfaErrorMessage = document.getElementById('mfa-error-message');
    const mfaErrorMessageDisable = document.getElementById('mfa-error-message-disable');

    function closeMfaModal() {
        if (mfaModal) {
            mfaModal.style.display = 'none';
        }
        if (mfaManualKeyDiv) {
            mfaManualKeyDiv.textContent = '';
            mfaManualKeyDiv.style.display = 'none';
        }
        if (mfaTokenInput) mfaTokenInput.value = '';
        if (mfaPasswordInput) mfaPasswordInput.value = '';
        if (mfaErrorMessage) mfaErrorMessage.style.display = 'none';
        if (mfaErrorMessageDisable) mfaErrorMessageDisable.style.display = 'none';
    }

    // --- Lógica de la Barra de Navegación (Ejecución Inmediata) ---
    // (Asegura que el menú desplegable de fechas funcione en todas las páginas)
    (function attachNavEvents() {
        const navDateSelect = document.getElementById('nav-date-select');
        const navDateForm = document.getElementById('nav-date-form');
        
        if (navDateSelect && navDateForm) {
          navDateSelect.addEventListener('change', function() {
            if (this.value === 'custom') {
              window.location.href = '/horario';
            } else {
              navDateForm.submit();
            }
          });
        }
    })(); 

    // --- Lógica del Modal de Avatar (Existente) ---
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const avatars = document.querySelectorAll('.zoomable-avatar');

    if (modal && modalImg && avatars.length > 0) {
        avatars.forEach(avatar => {
            avatar.addEventListener('click', function() {
                modal.style.display = 'flex';
                modalImg.src = this.src;
            });
        });

        modal.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    
    // --- Lógica de Reserva (Fetch API) (Existente) ---
    const bookingButtons = document.querySelectorAll('.btn-reservar');

    bookingButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const sessionId = this.dataset.sessionId;
            const roomName = this.dataset.roomName;
            
            if (!sessionId || !roomName) {
                showNotification('Error: Faltan datos en el botón.', true);
                return;
            }

            this.disabled = true;
            const originalText = this.textContent;
            this.textContent = 'Reservando...';

            try {
                const response = await fetch('/api/reservar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        roomName: roomName
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    showNotification(result.message || '¡Reserva completada!');
                    this.textContent = '¡Reservado!';
                } else {
                    throw new Error(result.message || 'Error en la respuesta del servidor.');
                }

            } catch (error) {
                console.error('Error al reservar:', error);
                showNotification(error.message, true);
                this.disabled = false;
                this.textContent = originalText;
            }
        });
    });


    // --- LÓGICA DE GESTIÓN DE FAVORITOS (Versión India) ---
    const favoriteButtons = document.querySelectorAll('.clase-favorite-btn');

    favoriteButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const activityName = this.dataset.activity;
            const currentAction = this.dataset.action;
            
            if (!activityName) return;

            // Deshabilitar botón durante la acción
            this.disabled = true;
            const iconSvg = this.querySelector('svg');

            try {
                const response = await fetch('/profile/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activityName: activityName,
                        action: currentAction === 'add' ? 'add' : 'remove' // Usar las acciones del controlador
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Error al actualizar favoritos.');
                }

                // 1. Actualización de la Interfaz (UI)
                
                if (result.added) {
                    // Si se añadió con éxito
                    this.classList.add('active');
                    this.dataset.action = 'remove';
                    this.title = 'Quitar de Favoritas';
                    if (iconSvg) iconSvg.setAttribute('fill', 'currentColor');
                    showNotification('"' + activityName + '" añadida a favoritos.');
                    
                } else if (result.removed) {
                    // Si se eliminó con éxito
                    this.classList.remove('active');
                    this.dataset.action = 'add';
                    this.title = 'Añadir a Favoritas';
                    if (iconSvg) iconSvg.setAttribute('fill', 'none');
                    showNotification('"' + activityName + '" eliminada de favoritos.');
                    
                } else {
                     // Caso inesperado
                    showNotification('Estado actualizado.', false);
                }

            } catch (error) {
                console.error('Error en favoritos:', error);
                showNotification(error.message, true);
            } finally {
                this.disabled = false;
            }
        });
    });

    // --- Lógica de MFA (Sin Cambios) ---
    // (Asumimos que el código de MFA, Desactivación y Verificación existe aquí)
    
}); // Fin del DOMContentLoaded
