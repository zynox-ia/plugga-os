/** Simula só a renderização oficial; nenhuma credencial vai ao Google. */
export const GOOGLE_SIGN_IN_STUB = `
  function renderButton(slot, options) {
    slot.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Fazer login com o Google";
    button.dataset.loginState = options.state || "";
    slot.appendChild(button);
  }
  window.google = { accounts: { id: { renderButton } } };
  document.querySelectorAll(".g_id_signin").forEach((slot) => {
    renderButton(slot, { state: slot.dataset.state });
  });
`;
