import { DatePicker } from '@ark-ui/react/date-picker'
import { Portal } from '@ark-ui/react/portal'
import { parseDate } from '@internationalized/date'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const CELL_TRIGGER_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-full text-on-surface transition-colors ' +
  'hover:bg-primary/10 data-[today]:font-bold data-[outside-range]:text-outline/40 ' +
  'data-[selected]:bg-primary data-[selected]:text-on-primary data-[selected]:hover:opacity-90 ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-30'

const NAV_TRIGGER_CLASS = 'rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary'

// Substitui <input type="date"> nas telas de paciente. Value/onChange mantem
// o formato de evento nativo (`e.target.value`, string ISO) — os chamadores
// existentes (set(field) do NewPatient, handlers inline do PatientDetail) nao
// precisam mudar, so o elemento troca.
export default function DatePickerField({ value, onChange, placeholder = 'Selecione a data', disabled = false, id }) {
  const selectedValue = value ? [parseDate(value)] : []

  function handleValueChange(details) {
    onChange({ target: { value: details.valueAsString[0] ?? '' } })
  }

  return (
    <DatePicker.Root
      value={selectedValue}
      onValueChange={handleValueChange}
      locale="pt-BR"
      disabled={disabled}
      openOnClick
      ids={id ? { input: id } : undefined}
    >
      <DatePicker.Control
        className="flex items-center gap-1 rounded-2xl border border-outline-variant/80 bg-surface-container-low py-1.5 pl-4 pr-1.5 text-sm text-on-surface
          focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary-100/60 data-[disabled]:pointer-events-none data-[disabled]:opacity-60"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)' }}
      >
        <DatePicker.Input
          className="flex-1 bg-transparent py-1.5 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
          placeholder={placeholder}
        />
        {value && (
          <DatePicker.ClearTrigger className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-error-container/30 hover:text-error">
            <X size={14} />
          </DatePicker.ClearTrigger>
        )}
        <DatePicker.Trigger className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary data-[disabled]:pointer-events-none">
          <Calendar size={16} />
        </DatePicker.Trigger>
      </DatePicker.Control>

      <Portal>
        <DatePicker.Positioner>
          <DatePicker.Content className="z-50 w-[19rem] rounded-2xl border border-outline-variant bg-surface p-3 shadow-modal">
            <DatePicker.View view="day">
              <DatePicker.Context>
                {(api) => (
                  <>
                    <DatePicker.ViewControl className="mb-2 flex items-center justify-between">
                      <DatePicker.PrevTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronLeft size={18} />
                      </DatePicker.PrevTrigger>
                      <DatePicker.ViewTrigger className="rounded-lg px-3 py-1 text-label-md font-label-md capitalize text-on-surface hover:bg-surface-container-low">
                        <DatePicker.RangeText />
                      </DatePicker.ViewTrigger>
                      <DatePicker.NextTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronRight size={18} />
                      </DatePicker.NextTrigger>
                    </DatePicker.ViewControl>

                    <DatePicker.Table className="w-full border-collapse text-center text-sm">
                      <DatePicker.TableHead>
                        <DatePicker.TableRow>
                          {api.weekDays.map((weekDay, i) => (
                            <DatePicker.TableHeader key={i} className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                              {weekDay.short}
                            </DatePicker.TableHeader>
                          ))}
                        </DatePicker.TableRow>
                      </DatePicker.TableHead>
                      <DatePicker.TableBody>
                        {api.weeks.map((week, i) => (
                          <DatePicker.TableRow key={i}>
                            {week.map((day, j) => (
                              <DatePicker.TableCell key={j} value={day} className="p-0.5">
                                <DatePicker.TableCellTrigger className={CELL_TRIGGER_CLASS}>
                                  {day.day}
                                </DatePicker.TableCellTrigger>
                              </DatePicker.TableCell>
                            ))}
                          </DatePicker.TableRow>
                        ))}
                      </DatePicker.TableBody>
                    </DatePicker.Table>
                  </>
                )}
              </DatePicker.Context>
            </DatePicker.View>

            <DatePicker.View view="month">
              <DatePicker.Context>
                {(api) => (
                  <>
                    <DatePicker.ViewControl className="mb-2 flex items-center justify-between">
                      <DatePicker.PrevTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronLeft size={18} />
                      </DatePicker.PrevTrigger>
                      <DatePicker.ViewTrigger className="rounded-lg px-3 py-1 text-label-md font-label-md text-on-surface hover:bg-surface-container-low">
                        <DatePicker.RangeText />
                      </DatePicker.ViewTrigger>
                      <DatePicker.NextTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronRight size={18} />
                      </DatePicker.NextTrigger>
                    </DatePicker.ViewControl>
                    <DatePicker.Table className="w-full text-sm">
                      <DatePicker.TableBody>
                        {api.getMonthsGrid({ columns: 4, format: 'short' }).map((months, i) => (
                          <DatePicker.TableRow key={i}>
                            {months.map((month, j) => (
                              <DatePicker.TableCell key={j} value={month.value} className="p-1">
                                <DatePicker.TableCellTrigger className={`${CELL_TRIGGER_CLASS} h-9 w-full rounded-xl capitalize`}>
                                  {month.label}
                                </DatePicker.TableCellTrigger>
                              </DatePicker.TableCell>
                            ))}
                          </DatePicker.TableRow>
                        ))}
                      </DatePicker.TableBody>
                    </DatePicker.Table>
                  </>
                )}
              </DatePicker.Context>
            </DatePicker.View>

            <DatePicker.View view="year">
              <DatePicker.Context>
                {(api) => (
                  <>
                    <DatePicker.ViewControl className="mb-2 flex items-center justify-between">
                      <DatePicker.PrevTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronLeft size={18} />
                      </DatePicker.PrevTrigger>
                      <DatePicker.ViewTrigger className="rounded-lg px-3 py-1 text-label-md font-label-md text-on-surface hover:bg-surface-container-low">
                        <DatePicker.RangeText />
                      </DatePicker.ViewTrigger>
                      <DatePicker.NextTrigger className={NAV_TRIGGER_CLASS}>
                        <ChevronRight size={18} />
                      </DatePicker.NextTrigger>
                    </DatePicker.ViewControl>
                    <DatePicker.Table className="w-full text-sm">
                      <DatePicker.TableBody>
                        {api.getYearsGrid({ columns: 4 }).map((years, i) => (
                          <DatePicker.TableRow key={i}>
                            {years.map((year, j) => (
                              <DatePicker.TableCell key={j} value={year.value} className="p-1">
                                <DatePicker.TableCellTrigger className={`${CELL_TRIGGER_CLASS} h-9 w-full rounded-xl`}>
                                  {year.label}
                                </DatePicker.TableCellTrigger>
                              </DatePicker.TableCell>
                            ))}
                          </DatePicker.TableRow>
                        ))}
                      </DatePicker.TableBody>
                    </DatePicker.Table>
                  </>
                )}
              </DatePicker.Context>
            </DatePicker.View>
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  )
}
