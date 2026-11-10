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
  Copy,
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
  KeyRound,
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
 * Icono de YouTube. Lucide retiró los logotipos de marcas, así que este glifo
 * replica su trazo para no depender de emojis ni de imágenes externas.
 */
function YoutubeGlyph({ size = 24, strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  )
}

/**
 * Marca de GitHub. Lucide ya no incluye logotipos de marcas, así que se
 * dibuja el mismo contorno para enlazar al repositorio oficial.
 */
function GithubGlyph({ size = 24, strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.1-.3 6.4-1.5 6.4-7A5.4 5.4 0 0 0 19 3.8 5 5 0 0 0 18.9.4S17.7 0 15 1.6a13.4 13.4 0 0 0-7 0C5.3 0 4.1.4 4.1.4A5 5 0 0 0 4 3.8a5.4 5.4 0 0 0-1.4 3.7c0 5.5 3.3 6.7 6.4 7A4.8 4.8 0 0 0 8 18v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

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
  copy: Copy,
  eraser: Eraser,
  github: GithubGlyph,
  key: KeyRound,
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
  youtube: YoutubeGlyph,
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
