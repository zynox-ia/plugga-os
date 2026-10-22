"use client";

// shadcn/ui, new-york-v4 (MIT). Estilos adaptados aos tokens e ao CSS da Plugga.
// https://ui.shadcn.com/r/styles/new-york-v4/calendar.json
import { useEffect, useRef, type ComponentProps } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

export function Calendar({ className = "", classNames, showOutsideDays = true, captionLayout = "label", components, ...props }: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return <DayPicker locale={ptBR} showOutsideDays={showOutsideDays} captionLayout={captionLayout}
    className={`ui-calendar ${className}`} classNames={{ ...defaults, ...classNames }}
    labels={{ labelPrevious: () => "Mês anterior", labelNext: () => "Próximo mês",
      labelDayButton: (date) => date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) }}
    components={{
      Root: ({ className: rootClass, rootRef, ...rootProps }) => <div data-slot="calendar" ref={rootRef} className={rootClass} {...rootProps} />,
      Chevron: ({ orientation, className: chevronClass }) => {
        const Icon = orientation === "left" ? ChevronLeftIcon : orientation === "right" ? ChevronRightIcon : ChevronDownIcon;
        return <Icon className={chevronClass} size={16} aria-hidden="true" />;
      },
      DayButton: CalendarDayButton,
      ...components,
    }} {...props} />;
}

export function CalendarDayButton({ className = "", day, modifiers, ...props }: ComponentProps<typeof DayButton>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (modifiers.focused) ref.current?.focus(); }, [modifiers.focused]);
  return <button ref={ref} type="button" data-day={day.date.toLocaleDateString("pt-BR")}
    data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
    data-range-start={modifiers.range_start} data-range-end={modifiers.range_end} data-range-middle={modifiers.range_middle}
    className={`ui-calendar-day ${className}`} {...props} />;
}
