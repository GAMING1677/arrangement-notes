import * as React from 'react'
import { cn } from '@/lib/utils'

type MenuContext = { open: boolean; setOpen: (open: boolean) => void }
const Context = React.createContext<MenuContext | null>(null)
export function DropdownMenu({ children }: { children: React.ReactNode }) { const [open, setOpen] = React.useState(false); return <Context.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></Context.Provider> }
export function DropdownMenuTrigger({ children, asChild = false }: { children: React.ReactNode; asChild?: boolean }) { const context = React.useContext(Context); if (asChild && React.isValidElement<{ onClick?: React.MouseEventHandler }>(children)) return React.cloneElement(children, { onClick: (event) => { children.props.onClick?.(event); context?.setOpen(!context.open) } }); return <button type="button" onClick={() => context?.setOpen(!context.open)}>{children}</button> }
export function DropdownMenuContent({ className, children }: React.ComponentProps<'div'>) { const context = React.useContext(Context); if (!context?.open) return null; return <div className={cn('absolute right-0 z-40 mt-1 min-w-40 rounded-md border bg-popover p-1 shadow-lg', className)}>{children}</div> }
export function DropdownMenuItem({ className, onSelect, ...props }: React.ComponentProps<'button'> & { onSelect?: () => void }) { const context = React.useContext(Context); return <button type="button" className={cn('flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent', className)} onClick={() => { onSelect?.(); context?.setOpen(false) }} {...props} /> }
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} /> }
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<'div'>) { return <div role="separator" className={cn('my-1 h-px bg-border', className)} {...props} /> }
