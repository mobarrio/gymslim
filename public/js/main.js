// Fichero: /public/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Lógica del Modal de Avatar (Sin cambios) ---
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

    // --- ¡NUEVO! Lógica para el selector de fecha del Nav ---
    const navDateSelect = document.getElementById('nav-date-select');
    const navDateForm = document.getElementById('nav-date-form');
    
    if (navDateSelect && navDateForm) {
      navDateSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
          // Si elige 'custom', redirigir a la página de horario
          window.location.href = '/horario';
        } else {
          // Para cualquier otra opción, enviar el formulario
          navDateForm.submit();
        }
      });
    }
    // --- Fin de la nueva lógica ---


    // --- Lógica de Notificación (Toast) (Sin cambios) ---
    const toastElement = document.getElementById('notification-toast');
    const messageElement = document.getElementById('notification-message');
    let toastTimeout;

    /**
     * Muestra una notificación (toast)
     * @param {string} message - El mensaje a mostrar.
     * @param {boolean} [isError=false] - True si es un mensaje de error.
     */
    function showNotification(message, isError = false) {
        // Limpia cualquier timeout anterior
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        
        if (!toastElement || !messageElement) {
          // Si el toast no existe en esta página, usar un alert simple
          // (No usar alert() en producción, pero es un fallback)
          console.log("Toast:", message);
          return;
        }

        messageElement.textContent = message;
        
        if (isError) {
            toastElement.classList.add('error');
        } else {
            toastElement.classList.remove('error');
        }

        toastElement.classList.remove('hidden');

        // Oculta el toast después de 4 segundos
        toastTimeout = setTimeout(() => {
            toastElement.classList.add('hidden');
        }, 4000);
    }


    // --- Lógica de Reserva (Fetch API) (Sin cambios) ---
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

            // Deshabilita el botón para evitar doble clic
            this.disabled = true;
            const originalText = this.textContent;
            this.textContent = 'Reservando...';

            try {
                // 1. Llama a NUESTRA PROPIA API (el proxy)
                const response = await fetch('/api/reservar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        roomName: roomName
                    })
                });

                // 2. Obtiene la respuesta de nuestro servidor
                const result = await response.json();

                if (response.ok) {
                    // ¡Éxito!
                    showNotification(result.message || '¡Reserva completada!');
                    this.textContent = '¡Reservado!';
                    // Mantenemos el botón deshabilitado para que no reserven de nuevo
                } else {
                    // Error (ej. 500 de nuestro servidor o 400)
                    throw new Error(result.message || 'Error en la respuesta del servidor.');
                }

            } catch (error) {
                // Error (ej. de red o el JSON falló)
                console.error('Error al reservar:', error);
                showNotification(error.message, true);
                
                // Reactiva el botón solo si hay un error para que pueda reintentar
                this.disabled = false;
                this.textContent = originalText;
            }
        });
    });
});
