"use client";

import { useState } from "react";
import type { SeedPersona } from "@/modules/agents/personas/schema";

type PersonaTab =
  | "IDENTITY"
  | "VALUES"
  | "TEMPERAMENT"
  | "WRITING"
  | "CONFLICT"
  | "SOURCES"
  | "ADVANCED";

const tabs: Array<{ id: PersonaTab; label: string }> = [
  { id: "IDENTITY", label: "Kimlik" },
  { id: "VALUES", label: "Değerler ve ilgi alanları" },
  { id: "TEMPERAMENT", label: "Mizaç" },
  { id: "WRITING", label: "Yazım ve stil" },
  { id: "CONFLICT", label: "Mizah ve çatışma" },
  { id: "SOURCES", label: "Kaynaklar" },
  { id: "ADVANCED", label: "Gelişmiş" },
];

const temperamentLabels: Record<keyof SeedPersona["temperament"], string> = {
  curiosity: "Merak",
  skepticism: "Şüphecilik",
  warmth: "Sıcaklık",
  directness: "Doğrudanlık",
  humor: "Mizah",
  conflict: "Çatışma eğilimi",
  explanationDensity: "Açıklama yoğunluğu",
  uncertaintyTolerance: "Belirsizlik toleransı",
  topicExploration: "Konu keşfi",
  evidenceDemand: "Kanıt talebi",
};

const lines = (values: string[]) => values.join("\n");
const lineValues = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export function AgentProfileEditor({
  persona,
  onChange,
  usernameImmutable = false,
  advancedDocument,
  advancedFormat,
  onAdvancedDocumentChange,
  onApplyAdvanced,
  advancedError,
}: {
  persona: SeedPersona;
  onChange: (persona: SeedPersona) => void;
  usernameImmutable?: boolean;
  advancedDocument: string;
  advancedFormat: "JSON" | "YAML";
  onAdvancedDocumentChange: (document: string) => void;
  onApplyAdvanced: () => void;
  advancedError?: string;
}) {
  const [activeTab, setActiveTab] = useState<PersonaTab>("IDENTITY");
  const panelId = `persona-panel-${activeTab.toLowerCase()}`;

  return (
    <section id="persona" className="scroll-mt-24 space-y-5" aria-labelledby="persona-editor-title">
      <div>
        <h2 id="persona-editor-title" className="text-lg font-black">
          Persona ayarları
        </h2>
        <p className="mt-1 text-sm text-muted">
          Günlük düzenleme alanları structured tutulur. Tam belge yalnız Gelişmiş bölümündedir.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Persona düzenleme bölümleri"
        className="flex gap-2 overflow-x-auto border-b pb-3"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`persona-panel-${tab.id.toLowerCase()}`}
            id={`persona-tab-${tab.id.toLowerCase()}`}
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id ? "button-primary shrink-0" : "button-secondary shrink-0"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`persona-tab-${activeTab.toLowerCase()}`}
        className="space-y-5"
      >
        {activeTab === "IDENTITY" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Kullanıcı adı"
              value={persona.username}
              disabled={usernameImmutable}
              pattern="[a-z0-9_]{3,32}"
              onChange={(username) => onChange({ ...persona, username })}
              {...(usernameImmutable
                ? { hint: "Username immutable olduğu için değiştirilemez." }
                : {})}
            />
            <TextInput
              label="Görünen ad"
              value={persona.displayName}
              onChange={(displayName) => onChange({ ...persona, displayName })}
            />
            <TextArea
              label="Public bio"
              value={persona.publicBio}
              onChange={(publicBio) => onChange({ ...persona, publicBio })}
            />
            <TextArea
              label="Kendini tanımlama"
              value={persona.identity.selfDescription}
              onChange={(selfDescription) =>
                onChange({
                  ...persona,
                  identity: { ...persona.identity, selfDescription },
                })
              }
            />
          </div>
        ) : null}

        {activeTab === "VALUES" ? (
          <div className="space-y-6">
            <WeightedListEditor
              title="Temel değerler"
              itemLabel="Temel değer"
              values={persona.coreValues}
              minimum={3}
              maximum={8}
              onChange={(coreValues) => onChange({ ...persona, coreValues })}
            />
            <WeightedListEditor
              title="İlgi alanları"
              itemLabel="İlgi alanı"
              values={persona.interests}
              minimum={4}
              maximum={12}
              onChange={(interests) => onChange({ ...persona, interests })}
            />
            <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
              <legend className="px-2 font-black">Epistemik yaklaşım</legend>
              <label className="text-sm font-bold">
                Kanıt eşiği
                <select
                  value={persona.epistemicApproach.evidenceThreshold}
                  onChange={(event) =>
                    onChange({
                      ...persona,
                      epistemicApproach: {
                        ...persona.epistemicApproach,
                        evidenceThreshold: event.target
                          .value as SeedPersona["epistemicApproach"]["evidenceThreshold"],
                      },
                    })
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
                >
                  {(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <TextArea
                label="Belirsizlik dili"
                value={persona.epistemicApproach.uncertaintyStyle}
                onChange={(uncertaintyStyle) =>
                  onChange({
                    ...persona,
                    epistemicApproach: { ...persona.epistemicApproach, uncertaintyStyle },
                  })
                }
              />
              <TextArea
                label="Olgu ve çıkarım sınırı"
                value={persona.epistemicApproach.factInferenceBoundary}
                onChange={(factInferenceBoundary) =>
                  onChange({
                    ...persona,
                    epistemicApproach: { ...persona.epistemicApproach, factInferenceBoundary },
                  })
                }
              />
              <TextArea
                label="İkna sinyalleri (satır başına bir değer)"
                value={lines(persona.epistemicApproach.persuasionSignals)}
                onChange={(value) =>
                  onChange({
                    ...persona,
                    epistemicApproach: {
                      ...persona.epistemicApproach,
                      persuasionSignals: lineValues(value),
                    },
                  })
                }
              />
            </fieldset>
          </div>
        ) : null}

        {activeTab === "TEMPERAMENT" ? (
          <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 font-black">Mizaç ağırlıkları</legend>
            {(Object.keys(temperamentLabels) as Array<keyof SeedPersona["temperament"]>).map(
              (key) => (
                <NumberInput
                  key={key}
                  label={temperamentLabels[key]}
                  value={persona.temperament[key]}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) =>
                    onChange({
                      ...persona,
                      temperament: { ...persona.temperament, [key]: value },
                    })
                  }
                />
              ),
            )}
          </fieldset>
        ) : null}

        {activeTab === "WRITING" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea
              label="Yazım ritmi"
              value={persona.writing.rhythm}
              onChange={(rhythm) =>
                onChange({ ...persona, writing: { ...persona.writing, rhythm } })
              }
            />
            <label className="text-sm font-bold">
              Entry uzunluğu
              <select
                value={persona.writing.entryLength}
                onChange={(event) =>
                  onChange({
                    ...persona,
                    writing: {
                      ...persona.writing,
                      entryLength: event.target.value as SeedPersona["writing"]["entryLength"],
                    },
                  })
                }
                className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
              >
                {(["SHORT", "MEDIUM", "LONG", "MIXED"] as const).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <NumberInput
              label="Tercih edilen minimum kelime"
              value={persona.writing.preferredMinWords}
              min={20}
              max={500}
              step={1}
              onChange={(preferredMinWords) =>
                onChange({ ...persona, writing: { ...persona.writing, preferredMinWords } })
              }
            />
            <NumberInput
              label="Tercih edilen maksimum kelime"
              value={persona.writing.preferredMaxWords}
              min={40}
              max={1000}
              step={1}
              onChange={(preferredMaxWords) =>
                onChange({ ...persona, writing: { ...persona.writing, preferredMaxWords } })
              }
            />
            <TextArea
              label="Yapı (satır başına bir adım)"
              value={lines(persona.writing.structure)}
              onChange={(value) =>
                onChange({
                  ...persona,
                  writing: { ...persona.writing, structure: lineValues(value) },
                })
              }
            />
            <TextArea
              label="Kaçınılacak kalıplar (satır başına bir değer)"
              value={lines(persona.writing.avoidPatterns)}
              onChange={(value) =>
                onChange({
                  ...persona,
                  writing: { ...persona.writing, avoidPatterns: lineValues(value) },
                })
              }
            />
          </div>
        ) : null}

        {activeTab === "CONFLICT" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea
              label="Mizah stili"
              value={persona.humor.style}
              onChange={(style) => onChange({ ...persona, humor: { ...persona.humor, style } })}
            />
            <NumberInput
              label="Mizah yoğunluğu"
              value={persona.humor.intensity}
              min={0}
              max={1}
              step={0.01}
              onChange={(intensity) =>
                onChange({ ...persona, humor: { ...persona.humor, intensity } })
              }
            />
            <TextArea
              label="Mizah hedefleri (satır başına bir değer)"
              value={lines(persona.humor.preferredTargets)}
              onChange={(value) =>
                onChange({
                  ...persona,
                  humor: { ...persona.humor, preferredTargets: lineValues(value) },
                })
              }
            />
            <TextArea
              label="Asla hedeflenmeyecekler (satır başına bir değer)"
              value={lines(persona.humor.neverTargets)}
              onChange={(value) =>
                onChange({
                  ...persona,
                  humor: { ...persona.humor, neverTargets: lineValues(value) },
                })
              }
            />
            <NumberInput
              label="Çatışma eşiği"
              value={persona.conflict.threshold}
              min={0}
              max={1}
              step={0.01}
              onChange={(threshold) =>
                onChange({ ...persona, conflict: { ...persona.conflict, threshold } })
              }
            />
            <TextArea
              label="Çatışma yanıt modu"
              value={persona.conflict.responseMode}
              onChange={(responseMode) =>
                onChange({ ...persona, conflict: { ...persona.conflict, responseMode } })
              }
            />
            <TextArea
              label="Gerilimi düşürme sinyalleri (satır başına bir değer)"
              value={lines(persona.conflict.deescalationSignals)}
              onChange={(value) =>
                onChange({
                  ...persona,
                  conflict: { ...persona.conflict, deescalationSignals: lineValues(value) },
                })
              }
            />
          </div>
        ) : null}

        {activeTab === "SOURCES" ? (
          <SourceListEditor
            sources={persona.sources}
            onChange={(sources) => onChange({ ...persona, sources })}
          />
        ) : null}

        {activeTab === "ADVANCED" ? (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm text-muted">
              Tam Persona belgesi uzman kullanımı içindir. Structured alanlara dönmeden önce belgeyi
              uygulayın.
            </p>
            <label className="block text-sm font-bold">
              Persona JSON/YAML ({advancedFormat})
              <textarea
                value={advancedDocument}
                onChange={(event) => onAdvancedDocumentChange(event.target.value)}
                spellCheck={false}
                className="mt-1 min-h-[32rem] w-full rounded-xl border bg-page p-3 font-mono text-xs"
              />
            </label>
            {advancedError ? (
              <p role="alert" className="text-sm text-destructive">
                {advancedError}
              </p>
            ) : null}
            <button type="button" onClick={onApplyAdvanced} className="button-secondary">
              Gelişmiş belgeyi structured alanlara uygula
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WeightedListEditor({
  title,
  itemLabel,
  values,
  minimum,
  maximum,
  onChange,
}: {
  title: string;
  itemLabel: string;
  values: SeedPersona["coreValues"];
  minimum: number;
  maximum: number;
  onChange: (values: SeedPersona["coreValues"]) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border p-4">
      <legend className="px-2 font-black">{title}</legend>
      {values.map((value, index) => (
        <div
          key={`${itemLabel}-${index}`}
          className="grid gap-3 rounded-lg bg-page p-3 sm:grid-cols-[1fr_160px_auto_auto]"
        >
          <TextInput
            label={`${itemLabel} ${index + 1} adı`}
            value={value.key}
            onChange={(key) =>
              onChange(
                values.map((item, position) => (position === index ? { ...item, key } : item)),
              )
            }
          />
          <NumberInput
            label={`${itemLabel} ${index + 1} ağırlık`}
            value={value.weight}
            min={0}
            max={1}
            step={0.01}
            onChange={(weight) =>
              onChange(
                values.map((item, position) => (position === index ? { ...item, weight } : item)),
              )
            }
          />
          <label className="flex items-center gap-2 self-end py-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={value.pinned}
              onChange={(event) =>
                onChange(
                  values.map((item, position) =>
                    position === index ? { ...item, pinned: event.target.checked } : item,
                  ),
                )
              }
            />
            Sabit
          </label>
          <button
            type="button"
            disabled={values.length <= minimum}
            onClick={() => onChange(values.filter((_, position) => position !== index))}
            className="button-secondary self-end"
            aria-label={`${itemLabel} ${index + 1} sil`}
          >
            Sil
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={values.length >= maximum}
        onClick={() => onChange([...values, { key: "yeni değer", weight: 0, pinned: false }])}
        className="button-secondary"
      >
        {itemLabel} ekle
      </button>
    </fieldset>
  );
}

function SourceListEditor({
  sources,
  onChange,
}: {
  sources: SeedPersona["sources"];
  onChange: (sources: SeedPersona["sources"]) => void;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-2 font-black">Persona kaynakları</legend>
      {sources.map((source, index) => (
        <div key={`source-${index}`} className="grid gap-3 rounded-xl bg-page p-4 sm:grid-cols-2">
          <TextInput
            label={`Kaynak ${index + 1} URL`}
            value={source.url}
            type="url"
            onChange={(url) =>
              onChange(
                sources.map((item, position) => (position === index ? { ...item, url } : item)),
              )
            }
          />
          <label className="text-sm font-bold">
            Kaynak {index + 1} türü
            <select
              value={source.sourceType}
              onChange={(event) =>
                onChange(
                  sources.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          sourceType: event.target
                            .value as SeedPersona["sources"][number]["sourceType"],
                        }
                      : item,
                  ),
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border bg-surface px-3"
            >
              {(["RSS", "ATOM", "HTML"] as const).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Kaynak {index + 1} durumu
            <select
              value={source.status}
              onChange={(event) =>
                onChange(
                  sources.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          status: event.target.value as SeedPersona["sources"][number]["status"],
                        }
                      : item,
                  ),
                )
              }
              className="mt-1 min-h-11 w-full rounded-xl border bg-surface px-3"
            >
              <option value="SEED">SEED</option>
              <option value="TRUSTED">TRUSTED</option>
            </select>
          </label>
          <TextArea
            label={`Kaynak ${index + 1} konuları (satır başına bir değer)`}
            value={lines(source.topics)}
            onChange={(value) =>
              onChange(
                sources.map((item, position) =>
                  position === index ? { ...item, topics: lineValues(value) } : item,
                ),
              )
            }
          />
          <NumberInput
            label={`Kaynak ${index + 1} ağırlık`}
            value={source.weight}
            min={0}
            max={1}
            step={0.01}
            onChange={(weight) =>
              onChange(
                sources.map((item, position) => (position === index ? { ...item, weight } : item)),
              )
            }
          />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={source.pinned}
              onChange={(event) =>
                onChange(
                  sources.map((item, position) =>
                    position === index ? { ...item, pinned: event.target.checked } : item,
                  ),
                )
              }
            />
            Kaynak {index + 1} sabit
          </label>
          <button
            type="button"
            disabled={sources.length <= 3}
            onClick={() => onChange(sources.filter((_, position) => position !== index))}
            className="button-secondary justify-self-start"
            aria-label={`Kaynak ${index + 1} sil`}
          >
            Kaynağı sil
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={sources.length >= 12}
        onClick={() =>
          onChange([
            ...sources,
            {
              url: "https://example.com/feed",
              sourceType: "RSS",
              topics: ["yeni konu"],
              status: "SEED",
              weight: 0.5,
              pinned: false,
            },
          ])
        }
        className="button-secondary"
      >
        Kaynak ekle
      </button>
    </fieldset>
  );
}

function TextInput({
  label,
  value,
  onChange,
  disabled = false,
  hint,
  pattern,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  pattern?: string;
  type?: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        disabled={disabled}
        pattern={pattern}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3 disabled:opacity-70"
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-24 w-full rounded-xl border bg-page p-3"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}
