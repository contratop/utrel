export const APP_VERSION = '1.0'

export const BOARD_BACKGROUNDS = ['aurora', 'ocean', 'sunset', 'forest', 'berry', 'graphite']

export const BOARD_BACKGROUND_NAMES = {
  aurora: 'Aurora',
  ocean: 'Océano',
  sunset: 'Atardecer',
  forest: 'Bosque',
  berry: 'Frutos rojos',
  graphite: 'Grafito',
}

export const LABEL_COLORS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'gray',
]

export const LABEL_COLOR_NAMES = {
  green: 'Verde',
  yellow: 'Amarillo',
  orange: 'Naranja',
  red: 'Rojo',
  purple: 'Morado',
  blue: 'Azul',
  sky: 'Celeste',
  lime: 'Lima',
  pink: 'Rosa',
  gray: 'Gris',
}

// Paleta serena: tonos desaturados que se leen bien sobre el fondo oscuro y
// conviven sin gritar (el color de cada etiqueta es el mismo en toda la app).
export const LABEL_COLOR_HEX = {
  green: '#4f9f7a',
  yellow: '#b3944f',
  orange: '#c07e4e',
  red: '#b8595a',
  purple: '#8f7ad0',
  blue: '#5b7fca',
  sky: '#4c9fbe',
  lime: '#8aa257',
  pink: '#b06fa0',
  gray: '#6d7789',
}

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none']

export const PRIORITY_LABEL = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  none: 'Sin prioridad',
}

export const DUE_FILTERS = [
  { value: 'any', label: 'Cualquier fecha' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'today', label: 'Vencen hoy' },
  { value: 'week', label: 'Próximos 7 días' },
  { value: 'none', label: 'Sin fecha' },
  { value: 'complete', label: 'Completadas' },
]
