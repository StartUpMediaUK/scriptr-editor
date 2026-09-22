import { Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { useState } from 'react';
import type { ColourScheme, TimeFormat, TypographyRole } from 'scriptr-editor';
import { useScriptrPresentation } from 'scriptr-editor/react';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const labels: Record<TypographyRole, [string, string]> = {
  heading: ['Heading font', 'Titles and section headings.'],
  body: ['Body font', 'Paragraphs and the main writing surface.'],
  accent: ['Accent font', 'Text marked with the semantic accent style.'],
  reference: ['Reference font', 'Reference anchors and supporting notes.'],
};
const sizes = [12, 14, 16, 18, 20, 24, 30, 36, 48];

export function SettingsPanel() {
  const { preferences, fonts, themes, update, reset } =
    useScriptrPresentation();
  const [advanced, setAdvanced] = useState(false);
  const updateType = (
    role: TypographyRole,
    patch: { fontId?: string; size?: number },
  ) =>
    update({
      typography: { [role]: { ...preferences.typography[role], ...patch } },
    });
  const typeRow = (role: TypographyRole) => (
    <Field className="settings-type" key={role}>
      <div className="settings-type__heading">
        <FieldLabel>{labels[role][0]}</FieldLabel>
        <FieldDescription>{labels[role][1]}</FieldDescription>
      </div>
      <div className="settings-type__controls">
        <Select
          value={preferences.typography[role].fontId}
          onValueChange={(fontId) => fontId && updateType(role, { fontId })}
        >
          <SelectTrigger aria-label={`${labels[role][0]} family`}>
            <SelectValue>
              {(fontId: string) =>
                fonts.find((font) => font.id === fontId)?.label ?? fontId
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {fonts.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={String(preferences.typography[role].size)}
          onValueChange={(size) =>
            size && updateType(role, { size: Number(size) })
          }
        >
          <SelectTrigger aria-label={`${labels[role][0]} size`}>
            <SelectValue>{(size: string) => `${size}px`}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}px
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <p
        className="settings-type__preview"
        style={{
          fontFamily: `var(--scriptr-font-${role})`,
          fontSize: `var(--scriptr-size-${role})`,
        }}
      >
        Scripture, reflection, and thoughtful writing belong together.
      </p>
    </Field>
  );
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            aria-label="Open editor settings"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Settings2 />
      </SheetTrigger>
      <SheetContent className="settings-sheet">
        <SheetHeader>
          <SheetTitle>Editor settings</SheetTitle>
          <SheetDescription>
            Change the reading and writing experience.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="settings-scroll">
          <FieldGroup className="settings-fields">
            <Field>
              <FieldLabel>Time format</FieldLabel>
              <Select
                value={preferences.timeFormat}
                onValueChange={(value) =>
                  value && update({ timeFormat: value as TimeFormat })
                }
              >
                <SelectTrigger aria-label="Time format">
                  <SelectValue>
                    {(value: string) =>
                      value === 'system' ? 'System' : value.replace('-', ' ')
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {['system', '12-hour', '24-hour'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'system'
                          ? 'System'
                          : value.replace('-', ' ')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Colour scheme</FieldLabel>
              <ToggleGroup
                aria-label="Colour scheme"
                className="settings-schemes"
                value={[preferences.colourScheme]}
                onValueChange={(values) =>
                  values[0] &&
                  update({ colourScheme: values[0] as ColourScheme })
                }
              >
                {(
                  [
                    ['system', Monitor],
                    ['light', Sun],
                    ['dark', Moon],
                  ] as const
                ).map(([value, Icon]) => (
                  <ToggleGroupItem
                    aria-label={`${value} colour scheme`}
                    className="settings-scheme"
                    key={value}
                    value={value}
                  >
                    <span
                      className="settings-scheme__preview"
                      data-scheme={value}
                    >
                      <Icon />
                    </span>
                    <span>{value[0]!.toUpperCase() + value.slice(1)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <ToggleGroup
                aria-label="Theme"
                className="settings-themes"
                value={[preferences.themeId]}
                onValueChange={(values) =>
                  values[0] && update({ themeId: values[0] })
                }
              >
                {themes.map((theme) => (
                  <ToggleGroupItem
                    className="settings-theme"
                    key={theme.id}
                    value={theme.id}
                  >
                    <span className="settings-theme__swatches">
                      <i />
                      <i />
                    </span>
                    {theme.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field className="settings-interface">
              <div>
                <FieldLabel>Contrast</FieldLabel>
                <FieldDescription>
                  Adjust colours and borders across the interface.
                </FieldDescription>
              </div>
              <output>{preferences.contrast}%</output>
              <Slider
                aria-label="Contrast"
                min={50}
                max={150}
                value={preferences.contrast}
                onValueChange={(contrast) =>
                  update({
                    contrast:
                      typeof contrast === 'number'
                        ? contrast
                        : (contrast[0] ?? preferences.contrast),
                  })
                }
              />
            </Field>
            <section className="settings-typography">
              <header>
                <div>
                  <h3>Typography</h3>
                  <p>Configure the document's font roles.</p>
                </div>
                <FieldLabel className="settings-advanced">
                  Advanced{' '}
                  <Switch checked={advanced} onCheckedChange={setAdvanced} />
                </FieldLabel>
              </header>
              {(['heading', 'body', 'accent'] as const).map(typeRow)}
              {advanced ? typeRow('reference') : null}
            </section>
          </FieldGroup>
        </ScrollArea>
        <div className="settings-footer">
          <Button onClick={reset} variant="outline">
            Reset settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
