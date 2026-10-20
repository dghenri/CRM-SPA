export function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

const WEEKDAYS = [
  "Domingo", "Segunda", "Terça", "Quarta",
  "Quinta", "Sexta", "Sábado",
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function getFormattedDate() {
  const now = new Date();

  const weekday = WEEKDAYS[now.getDay()];
  const day = now.getDate();
  const month = MONTHS[now.getMonth()];

  return {
    weekday,
    day,
    month,
    full: `${weekday}, ${day} de ${month}`,
  };
}
