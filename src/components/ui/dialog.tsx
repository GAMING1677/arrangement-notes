import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DialogContextValue = { open: boolean; setOpen: (open: boolean) => void }
const DialogContext = React.createContext<DialogContextValue | null>(null)

export function Dialog({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const actualOpen = open ?? internalOpen
  const setOpen = (value: boolean) => { if (open === undefined) setInternalOpen(value); onOpenChange?.(value) }
  return <DialogContext.Provider value={{ open: actualOpen, setOpen }}>{children}</DialogContext.Provider>
}

export function DialogTrigger({ children, asChild = false }: { children: React.ReactNode; asChild?: boolean }) {
  const context = React.useContext(DialogContext)
  if (!context) return null
  if (asChild && React.isValidElement<{ onClick?: React.MouseEventHandler }>(children)) return React.cloneElement(children, { onClick: (event) => { children.props.onClick?.(event); context.setOpen(true) } })
  return <button type="button" onClick={() => context.setOpen(true)}>{children}</button>
}

export function DialogContent({ className, children, ...props }: React.ComponentProps<'div'>) {
  const context = React.useContext(DialogContext)
  React.useEffect(() => {
    if (!context?.open) return
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') context.setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [context])
  if (!context?.open || typeof document === 'undefined') return null
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) context.setOpen(false) }}><div role="dialog" aria-modal="true" className={cn('w-full max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-xl', className)} {...props}><button type="button" aria-label="閉じる" className="absolute" onClick={() => context.setOpen(false)}><X className="size-4" /></button>{children}</div></div>, document.body)
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} /> }
export function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) { return <h2 className={cn('text-lg font-semibold', className)} {...props} /> }
export function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) { return <p className={cn('text-sm text-muted-foreground', className)} {...props} /> }
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} /> }
