import React from 'react'
import { cn } from '@/lib/utils'

export function MaterialSymbol({ name, fill = false, className, style, 'aria-hidden': ariaHidden, ...props }) {
  const hasAccessibleName = props['aria-label'] || props['aria-labelledby']

  return (
    <span
      className={cn('material-symbols-rounded inline-flex shrink-0 select-none items-center justify-center leading-none', className)}
      aria-hidden={ariaHidden ?? (hasAccessibleName ? undefined : 'true')}
      data-symbol={name}
      style={{
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
        ...style,
      }}
      {...props}
    />
  )
}

function createMaterialIcon(name, options) {
  return function MaterialIcon({ className, ...props }) {
    return <MaterialSymbol name={name} className={className} {...options} {...props} />
  }
}

export const AlertCircle = createMaterialIcon('error')
export const AlertTriangle = createMaterialIcon('warning')
export const ArrowDown = createMaterialIcon('arrow_downward')
export const ArrowLeft = createMaterialIcon('arrow_back')
export const ArrowRight = createMaterialIcon('arrow_forward')
export const ArrowUp = createMaterialIcon('arrow_upward')
export const BookOpen = createMaterialIcon('menu_book')
export const Camera = createMaterialIcon('photo_camera')
export const Check = createMaterialIcon('check')
export const CheckCircle = createMaterialIcon('task_alt')
export const CheckCircle2 = createMaterialIcon('check_circle')
export const CheckIcon = Check
export const ChevronDown = createMaterialIcon('expand_more')
export const ChevronDownIcon = ChevronDown
export const ChevronRightIcon = createMaterialIcon('keyboard_arrow_right')
export const ChevronUpIcon = createMaterialIcon('expand_less')
export const CircleCheckIcon = CheckCircle2
export const CircleDot = createMaterialIcon('radio_button_checked')
export const ClipboardCheck = createMaterialIcon('assignment_turned_in')
export const ClipboardList = createMaterialIcon('assignment')
export const Clock = createMaterialIcon('schedule')
export const Download = createMaterialIcon('download')
export const ExternalLink = createMaterialIcon('open_in_new')
export const Eye = createMaterialIcon('visibility')
export const EyeOff = createMaterialIcon('visibility_off')
export const FileCheck2 = createMaterialIcon('task')
export const FileText = createMaterialIcon('description')
export const FileUp = createMaterialIcon('upload_file')
export const GraduationCap = createMaterialIcon('school')
export const GripVertical = createMaterialIcon('drag_indicator')
export const History = createMaterialIcon('history')
export const ImageOff = createMaterialIcon('image_not_supported')
export const ImagePlus = createMaterialIcon('add_photo_alternate')
export const ImageUp = ImagePlus
export const InfoIcon = createMaterialIcon('info')
export const LayoutDashboard = createMaterialIcon('dashboard')
export const ListChecks = createMaterialIcon('checklist')
export const Loader2 = createMaterialIcon('progress_activity')
export const Loader2Icon = Loader2
export const LogIn = createMaterialIcon('login')
export const LogOut = createMaterialIcon('logout')
export const Maximize2 = createMaterialIcon('open_in_full')
export const Menu = createMaterialIcon('menu')
export const Minus = createMaterialIcon('remove')
export const Moon = createMaterialIcon('dark_mode')
export const OctagonXIcon = createMaterialIcon('error')
export const PanelLeftClose = createMaterialIcon('left_panel_close')
export const PanelLeftOpen = createMaterialIcon('left_panel_open')
export const Pencil = createMaterialIcon('edit')
export const Play = createMaterialIcon('play_arrow', { fill: true })
export const Plus = createMaterialIcon('add')
export const RefreshCw = createMaterialIcon('refresh')
export const RotateCcw = RefreshCw
export const Settings = createMaterialIcon('settings')
export const ShieldCheck = createMaterialIcon('verified_user')
export const Sun = createMaterialIcon('light_mode')
export const Trash2 = createMaterialIcon('delete')
export const TriangleAlertIcon = AlertTriangle
export const UnlinkIcon = createMaterialIcon('link_off')
export const Users = createMaterialIcon('group')
export const VideoOff = createMaterialIcon('videocam_off')
export const X = createMaterialIcon('close')
export const XIcon = X
export const ZoomIn = createMaterialIcon('zoom_in')
export const ZoomOut = createMaterialIcon('zoom_out')
