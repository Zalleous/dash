export type Link = { name: string; href: string; group: string; icon?: string; check?: string };

const icons = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const pngOnly = ['suwayomi', 'homepage'];
export const iconUrl = (icon: string) => (pngOnly.includes(icon) ? `${icons}/png/${icon}.png` : `${icons}/svg/${icon}.svg`);
