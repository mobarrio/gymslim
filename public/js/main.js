// Fichero: /public/js/main.js (Versión Foxtrot - FINAL)

// --- Lógica del Menú de Navegación (Ejecución Inmediata para Consistencia) ---
// Se ejecuta inmediatamente para adjuntar eventos al menú de navegación antes de cualquier otro script.
(function attachNavEvents() {
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
})(); // Se llama inmediatamente

document.addEventListener('DOMContentLoaded', () => {
    
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
    
    // --- Lógica de Notificación (Toast) (Existente) ---
    const toastElement = document.getElementById('notification-toast');
    const messageElement = document.getElementById('notification-message');
    let toastTimeout;

    /**
     * Muestra una notificación (toast)
     */
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


    // --- Lógica de MFA (Versión Foxtrot) ---
    
    // Elementos del Modal
    const mfaModal = document.getElementById('mfa-modal');
    const mfaSetupContent = document.getElementById('mfa-setup-content');
    const mfaDisableContent = document.getElementById('mfa-disable-content');
    
    // Elementos de Activación
    const mfaEnableButton = document.getElementById('mfa-enable-button');
    const mfaQrCodeDiv = document.getElementById('mfa-qr-code');
    const mfaVerifyForm = document.getElementById('mfa-verify-form');
    const mfaTokenInput = document.getElementById('mfa-token-input');
    const mfaVerifyButton = document.getElementById('mfa-verify-button');
    const mfaCancelButton = document.getElementById('mfa-cancel-button');
    const mfaErrorMessage = document.getElementById('mfa-error-message');
    
    // Nuevo elemento: Clave manual 
    const mfaManualKeyDiv = document.getElementById('mfa-manual-key');

    // Elementos de Desactivación
    const mfaDisableButton = document.getElementById('mfa-disable-button');
    const mfaDisableForm = document.getElementById('mfa-disable-form');
    const mfaPasswordInput = document.getElementById('mfa-password-input');
    const mfaDisableConfirmButton = document.getElementById('mfa-disable-confirm-button');
    const mfaCancelDisableButton = document.getElementById('mfa-cancel-disable-button');
    const mfaErrorMessageDisable = document.getElementById('mfa-error-message-disable');

    function closeMfaModal() {
        if (mfaModal) {
            mfaModal.style.display = 'none';
        }
        // Limpiar el campo manual
        if (mfaManualKeyDiv) {
            mfaManualKeyDiv.textContent = '';
            mfaManualKeyDiv.style.display = 'none';
        }
        // Limpiar campos y errores
        if (mfaTokenInput) mfaTokenInput.value = '';
        if (mfaPasswordInput) mfaPasswordInput.value = '';
        if (mfaErrorMessage) mfaErrorMessage.style.display = 'none';
        if (mfaErrorMessageDisable) mfaErrorMessageDisable.style.display = 'none';
    }

    // 1. Flujo de Activación: Botón "Activar MFA" 
    if (mfaEnableButton) {
        mfaEnableButton.addEventListener('click', async () => {
            if (!mfaModal || !mfaSetupContent || !mfaQrCodeDiv) return;

            mfaModal.style.display = 'flex';
            mfaSetupContent.style.display = 'block';
            mfaDisableContent.style.display = 'none';
            mfaErrorMessage.style.display = 'none';
            
            if (mfaManualKeyDiv) {
                mfaManualKeyDiv.style.display = 'none';
            }

            mfaQrCodeDiv.innerHTML = 'Generando código QR...';
            mfaQrCodeDiv.className = 'loading';
            
            try {
                const response = await fetch('/profile/mfa/generate', {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.message || 'Error del servidor');
                }

                // Éxito: Mostrar el QR
                mfaQrCodeDiv.innerHTML = `<img src="${result.qrCodeDataUrl}" alt="MFA QR Code">`;
                mfaQrCodeDiv.className = 'loaded'; 

                // Mostrar la clave manual
                if (mfaManualKeyDiv && result.base32Secret) {
                    mfaManualKeyDiv.textContent = result.base32Secret.match(/.{1,4}/g).join(' '); // Formatear
                    mfaManualKeyDiv.style.display = 'block';
                }

            } catch (error) {
                mfaQrCodeDiv.innerHTML = `Error al cargar QR: ${error.message}`;
                mfaQrCodeDiv.className = 'error'; 
            }
        });
    }

    // 2. Flujo de Activación: Botón "Verificar y Activar" 
    if (mfaVerifyForm) {
        mfaVerifyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = mfaTokenInput.value;
            
            if (!token || token.length !== 6) {
                mfaErrorMessage.textContent = 'Introduce un código de 6 dígitos.';
                mfaErrorMessage.style.display = 'block';
                return;
            }

            mfaVerifyButton.disabled = true;
            mfaVerifyButton.textContent = 'Verificando...';

            try {
                const response = await fetch('/profile/mfa/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: token })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Error de verificación');
                }

                // ¡Éxito!
                closeMfaModal();
                showNotification(result.message || '¡MFA activado!');
                window.location.reload();

            } catch (error) {
                mfaErrorMessage.textContent = error.message;
                mfaErrorMessage.style.display = 'block';
                mfaVerifyButton.disabled = false;
                mfaVerifyButton.textContent = 'Verificar y Activar';
            }
        });
    }

    // 3. Flujo de Desactivación: Botón "Desactivar MFA" 
    if (mfaDisableButton) {
        mfaDisableButton.addEventListener('click', () => {
            if (!mfaModal || !mfaSetupContent || !mfaDisableContent) return;

            mfaModal.style.display = 'flex';
            mfaSetupContent.style.display = 'none';
            mfaDisableContent.style.display = 'block';
            mfaErrorMessageDisable.style.display = 'none';
        });
    }

    // 4. Flujo de Desactivación: Botón "Desactivar" (Confirmación) 
    if (mfaDisableForm) {
        mfaDisableForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = mfaPasswordInput.value;

            if (!password) {
                mfaErrorMessageDisable.textContent = 'Se requiere la contraseña.';
                mfaErrorMessageDisable.style.display = 'block';
                return;
            }

            mfaDisableConfirmButton.disabled = true;
            mfaDisableConfirmButton.textContent = 'Desactivando...';

            try {
                const response = await fetch('/profile/mfa/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: password })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Error de desactivación');
                }

                // ¡Éxito!
                closeMfaModal();
                showNotification(result.message || '¡MFA desactivado!');
                window.location.reload();

            } catch (error) {
                mfaErrorMessageDisable.textContent = error.message;
                mfaErrorMessageDisable.style.display = 'block';
                mfaDisableConfirmButton.disabled = false;
                mfaDisableConfirmButton.textContent = 'Desactivar';
            }
        });
    }

    // 5. Botones de Cancelar 
    if (mfaCancelButton) {
        mfaCancelButton.addEventListener('click', closeMfaModal);
    }
    if (mfaCancelDisableButton) {
        mfaCancelDisableButton.addEventListener('click', closeMfaModal);
    }
    if (mfaModal) {
        mfaModal.addEventListener('click', (e) => {
            if (e.target === mfaModal) { 
                closeMfaModal();
            }
        });
    }
    // --- FIN Lógica MFA ---

}); // Fin del DOMContentLoaded
