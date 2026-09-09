import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type SortOption = { value: string; label: string }

type SortControlProps = {
  value?: string
  onValueChange?: (value: string) => void
  options: readonly SortOption[]
  label?: string
}

function SortControl({ value, onValueChange, options, label = "Sort" }: SortControlProps) {
  return (
    <label className="flex min-w-0 items-center gap-3 text-sm font-semibold">
      <span>{label}</span>
      <Select value={value} onValueChange={(nextValue) => { if (nextValue !== null) onValueChange?.(nextValue) }}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}

export { SortControl }
