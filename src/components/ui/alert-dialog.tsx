import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type AlertContext = { open: boolean; setOpen: (open: boolean) => void }
const Context = React.createContext<AlertContext | null>(null)
export function AlertDialog({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const value = open ?? internalOpen
  const setOpen = (next: boolean) => { if (open === undefined) setInternalOpen(next); onOpenChange?.(next) }
  return <Context.Provider value={{ open: value, setOpen }}>{children}</Context.Provider>
}
export function AlertDialogTrigger({ children }: { children: React.ReactNode }) { const context = React.useContext(Context); return <button type="button" onClick={() => context?.setOpen(true)}>{children}</button> }
export function AlertDialogContent({ className, children, ...props }: React.ComponentProps<'div'>) { const context = React.useContext(Context); if (!context?.open || typeof document === 'undefined') return null; return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div role="alertdialog" aria-modal="true" className={cn('w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-xl', className)} {...props}>{children}</div></div>, document.body) }
export function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('flex flex-col gap-1.5', className)} {...props} /> }
export function AlertDialogTitle({ className, ...props }: React.ComponentProps<'h2'>) { return <h2 className={cn('text-lg font-semibold', className)} {...props} /> }
export function AlertDialogDescription({ className, ...props }: React.ComponentProps<'p'>) { return <p className={cn('text-sm text-muted-foreground', className)} {...props} /> }
export function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} /> }
export function AlertDialogCancel({ children = 'キャンセル' }: { children?: React.ReactNode }) { const context = React.useContext(Context); return <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => context?.setOpen(false)}>{children}</button> }
export function AlertDialogAction({ children = '確認' , onClick }: { children?: React.ReactNode; onClick?: () => void }) { const context = React.useContext(Context); return <button type="button" className="rounded-md bg-destructive px-4 py-2 text-sm text-white" onClick={() => { onClick?.(); context?.setOpen(false) }}>{children}</button> }
