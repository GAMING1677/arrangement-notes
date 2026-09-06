import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn('flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
}
