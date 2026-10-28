import {
  AlertTriangle,
  AlignLeft,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bold,
  Calendar,
  CalendarClock,
  CalendarX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code,
  Eraser,
  Eye,
  Flag,
  FolderKanban,
  GripVertical,
  Heading1,
  History,
  Image,
  Italic,
  ImageOff,
  LayoutGrid,
  Link,
  List,
  ListChecks,
  ListPlus,
  Minus,
  LoaderCircle,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Quote,
  Save,
  Search,
  ShieldCheck,
  Strikethrough,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react'

/**
 * Iconos de la interfaz. Todos vienen de Lucide (biblioteca SVG de trazo
 * abierto, https://lucide.dev) con el mismo grosor de línea, para que la app
 * se vea coherente sin depender de emojis del sistema.
 */
const ICONS = {
  alert: AlertTriangle,
  'align-left': AlignLeft,
  archive: Archive,
  'archive-restore': ArchiveRestore,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  bold: Bold,
  calendar: Calendar,
  'calendar-clock': CalendarClock,
  'calendar-x': CalendarX,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  code: Code,
  eraser: Eraser,
  eye: Eye,
  flag: Flag,
  'folder-kanban': FolderKanban,
  'grip-vertical': GripVertical,
  heading: Heading1,
  history: History,
  image: Image,
  'image-off': ImageOff,
  italic: Italic,
  'layout-grid': LayoutGrid,
  link: Link,
  list: List,
  'list-checks': ListChecks,
  'list-plus': ListPlus,
  minus: Minus,
  loader: LoaderCircle,
  'log-out': LogOut,
  message: MessageSquare,
  'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical,
  pencil: Pencil,
  plus: Plus,
  quote: Quote,
  save: Save,
  search: Search,
  shield: ShieldCheck,
  strikethrough: Strikethrough,
  tag: Tag,
  trash: Trash2,
  upload: Upload,
  user: User,
  users: Users,
  x: X,
  zap: Zap,
}

/**
 * Icono decorativo por defecto (aria-hidden); si le pasas `title` se anuncia
 * como imagen con ese nombre, para los iconos que no llevan texto al lado.
 */
export default function Icon({ name, size = 16, title, className = '', strokeWidth = 1.9, ...rest }) {
  const Glyph = ICONS[name]
  if (!Glyph) return null
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      focusable="false"
      className={`icon ${className}`.trim()}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      role={title ? 'img' : undefined}
      {...rest}
    />
  )
}
