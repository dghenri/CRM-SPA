// Normaliza o nome pra só a inicial de cada palavra ficar maiúscula
// (ex: "João da SILVA" -> "João da Silva"), mantendo preposições comuns de
// nome em minúsculo quando não são a primeira palavra (ex: "de", "da", "dos").
const LOWERCASE_CONNECTORS = new Set(["da", "das", "de", "do", "dos", "e"]);

export default function formatName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}
