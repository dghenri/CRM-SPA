import { Kbd } from "@heroui/react";

// Dica visual de tecla para botões de modais ("Esc", "↵"). Some em telas pequenas (celular não tem Esc/Enter).
//
//   <Button variant="tertiary" onPress={onClose}>Cancelar <KeyHint>Esc</KeyHint></Button>
//   <Button onPress={save}>Salvar <KeyHint keyValue="enter" onFilled /></Button>
//
// - `keyValue`: tecla que o HeroUI desenha como símbolo (ex: "enter" => ↵, "escape" => ⎋),
//   com o nome acessível ("Enter") no title.
// - sem `keyValue`: mostra o texto de `children` (ex: "Esc").
// - `onFilled`: use dentro de botão colorido (primário/danger), onde o cinza padrão do Kbd perde contraste.
export default function KeyHint({ keyValue, children, onFilled = false, className = "" }) {
  return (
    <Kbd
      variant="light"
      className={`ml-1 hidden sm:inline-flex ${onFilled ? "bg-white/25 text-white **:text-white" : ""} ${className}`.trim()}
    >
      {keyValue ? <Kbd.Abbr keyValue={keyValue} /> : <Kbd.Content>{children}</Kbd.Content>}
    </Kbd>
  );
}

// Enter confirma o modal (o Esc o React Aria já trata sozinho). Use no wrapper do conteúdo do diálogo:
//
//   <Modal.Dialog>
//     <div className="contents" onKeyDown={confirmOnEnter(save, saving)}> ... </div>
//   </Modal.Dialog>
//
// Regras:
// - Shift+Enter não confirma (quebra linha no campo de texto longo).
// - Só vale para teclas pressionadas DENTRO do próprio diálogo: os popovers do Select e do calendário
//   renderizam em portal, mas o React repassa o evento pela árvore, então checamos o diálogo mais próximo do alvo.
// - Enter em botão/link/select mantém a função própria deles (clicar, abrir).
// - Ignora Enter de composição (IME) e enquanto está salvando.
export function confirmOnEnter(onConfirm, isDisabled) {
  return (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing) return;
    const dialogSelector = '[role="dialog"], [role="alertdialog"]';
    if (e.target.closest(dialogSelector) !== e.currentTarget.closest(dialogSelector)) return;
    if (e.target.closest('button, a, [role="button"], [role="combobox"], [role="listbox"]')) return;
    if (isDisabled) return;
    e.preventDefault();
    onConfirm();
  };
}
