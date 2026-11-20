export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  /** Right-aligned, tabular figures. */
  numeric?: boolean
  /** Hide below the sm breakpoint. */
  hideOnMobile?: boolean
  class?: string
}

export interface TableSort {
  key: string
  dir: 'asc' | 'desc'
}

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}
