import { useEffect, useState, type FormEvent } from "react";
import { createProviderProfile, deleteProviderProfile, editProviderProfile, getProviderProfiles } from "../api/client";
import type { AdapterTypeInfo, ParameterFieldInfo, ProfileProblem, ProfileView, ProviderStage } from "../types";

const STAGES: ProviderStage[] = ["reasoning", "voice", "alignment", "image", "video"];
const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };

interface Props {
  password: string;
  /** An Administrator request was refused with 401: the page locks again. */
  onDenied: () => void;
  /** A profile was added, edited or deleted: the active-provider selectors must reload. */
  onChanged: () => void;
  /** Changes when the active provider of a stage was changed, so the list shows which provider is active. */
  refreshKey?: number;
}

type FormState = { kind: "add"; stage: ProviderStage } | { kind: "edit"; profile: ProfileView };

function valueAt(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), source);
}

function setAt(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  path.slice(0, -1).forEach((key) => {
    cursor[key] = cursor[key] ?? {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[path[path.length - 1]!] = value;
}

/** A number field is sent as a number; a text field that accepts one (the voice speed) is a number when it reads as one. */
function coerce(field: ParameterFieldInfo, raw: string): unknown {
  const asNumber = Number(raw);
  if (field.kind === "number") return raw.trim() === "" || Number.isNaN(asNumber) ? raw : asNumber;
  if (field.acceptsNumber && raw.trim() !== "" && !Number.isNaN(asNumber)) return asNumber;
  return raw;
}

function keyText(profile: ProfileView): string {
  if (profile.keyStatus === "stored") return profile.keyHint ? `Key stored (…${profile.keyHint})` : "Key stored";
  return profile.keyStatus === "environment" ? "Key from the environment" : "Key missing";
}

/**
 * manage-providers-from-admin (JOS-218), design Decision 10 — the profiles of every stage with their key status, and
 * the forms to add, edit and delete one. The key field is never pre-filled and an empty one keeps the current key; the
 * API never returns a key, so there is nothing to show but its status and its last four characters.
 */
export function ProviderProfilesSection({ password, onDenied, onChanged, refreshKey = 0 }: Props) {
  const [types, setTypes] = useState<AdapterTypeInfo[]>([]);
  const [profiles, setProfiles] = useState<ProfileView[] | undefined>(undefined);
  const [form, setForm] = useState<FormState | undefined>(undefined);
  const [confirming, setConfirming] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function load() {
    try {
      const result = await getProviderProfiles(password);
      if (result.kind === "denied") onDenied();
      else {
        setTypes(result.types);
        setProfiles(result.profiles);
      }
    } catch {
      setError("Could not load the providers. Is the app running?");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the profiles when the section opens or a provider changes
    void load();
    // The password and the lock callback do not change while the section is shown.
  }, [refreshKey]);

  async function handleDelete(profile: ProfileView) {
    setError(undefined);
    setNotice(undefined);
    setConfirming(undefined);
    try {
      const result = await deleteProviderProfile(password, profile.id);
      if (result.kind === "denied") return onDenied();
      if (result.kind === "active") return setError(`${profile.label} is the active ${STAGE_LABELS[result.stage].toLowerCase()} provider; choose another provider first.`);
      if (result.kind === "not-found") return setError(`${profile.label} no longer exists.`);
      setNotice(result.kind === "retired" ? `${profile.label} was retired: sessions are still bound to it, so it is no longer offered but keeps serving them.` : `${profile.label} was removed.`);
      onChanged();
      await load();
    } catch {
      setError(`${profile.label} could not be deleted. Is the app running?`);
    }
  }

  return (
    <section aria-label="Providers" className="field">
      <h2>Providers</h2>
      <p>Each provider has its own parameters and API key. An API key is stored encrypted on this computer and is never shown again.</p>
      {profiles === undefined && !error && <p className="session-loading">Loading providers…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {profiles &&
        STAGES.map((stage) => {
          const stageProfiles = profiles.filter((profile) => profile.stage === stage && !profile.retired);
          return (
            <div role="group" aria-label={`${STAGE_LABELS[stage]} providers`} key={stage}>
              <h3>{STAGE_LABELS[stage]}</h3>
              <ul>
                {stageProfiles.map((profile) => (
                  <li key={profile.id} aria-label={`${profile.label} provider`}>
                    <strong>{profile.label}</strong> <span>{types.find((type) => type.id === profile.adapterType)?.label ?? profile.adapterType}</span>{" "}
                    <span>{keyText(profile)}</span> {profile.active && <span>Active</span>}
                    {!profile.usable && profile.problems.map((problem) => <div key={problem.field + problem.message}>{problem.message}</div>)}
                    <div>
                      <button type="button" onClick={() => setForm({ kind: "edit", profile })}>{`Edit ${profile.label}`}</button>{" "}
                      {confirming === profile.id ? (
                        <>
                          <button type="button" onClick={() => void handleDelete(profile)}>{`Confirm delete ${profile.label}`}</button>{" "}
                          <button type="button" onClick={() => setConfirming(undefined)}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirming(profile.id)}>{`Delete ${profile.label}`}</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setForm({ kind: "add", stage })}>{`Add ${STAGE_LABELS[stage].toLowerCase()} provider`}</button>
              {form && ((form.kind === "add" && form.stage === stage) || (form.kind === "edit" && form.profile.stage === stage)) && (
                <ProfileForm
                  key={form.kind === "edit" ? form.profile.id : "add"}
                  form={form}
                  stage={stage}
                  types={types.filter((type) => type.stage === stage)}
                  password={password}
                  onDenied={onDenied}
                  onCancel={() => setForm(undefined)}
                  onSaved={async () => {
                    setForm(undefined);
                    setNotice(undefined);
                    onChanged();
                    await load();
                  }}
                />
              )}
            </div>
          );
        })}
    </section>
  );
}

interface FormProps {
  form: FormState;
  stage: ProviderStage;
  types: AdapterTypeInfo[];
  password: string;
  onDenied: () => void;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function ProfileForm({ form, stage, types, password, onDenied, onCancel, onSaved }: FormProps) {
  const editing = form.kind === "edit" ? form.profile : undefined;
  const [typeId, setTypeId] = useState<string>(editing?.adapterType ?? types[0]?.id ?? "");
  const type = types.find((candidate) => candidate.id === typeId);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of types.find((candidate) => candidate.id === (editing?.adapterType ?? types[0]?.id))?.fields ?? []) {
      const current = editing ? valueAt(editing.parameters, field.path) : undefined;
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a parameter value is a string or a number
      initial[field.path.join(".")] = current === undefined ? "" : String(current);
    }
    return initial;
  });
  const [apiKey, setApiKey] = useState("");
  const [problems, setProblems] = useState<ProfileProblem[]>([]);
  const [saving, setSaving] = useState(false);
  const title = editing ? `Edit ${STAGE_LABELS[stage].toLowerCase()} provider ${editing.label}` : `Add ${STAGE_LABELS[stage].toLowerCase()} provider`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !type) return;
    const parameters: Record<string, unknown> = {};
    for (const field of type.fields) setAt(parameters, field.path, coerce(field, values[field.path.join(".")] ?? ""));
    setSaving(true);
    setProblems([]);
    try {
      const input = { label, parameters, ...(apiKey ? { apiKey } : {}) };
      const result = editing ? await editProviderProfile(password, editing.id, input) : await createProviderProfile(password, { ...input, stage, adapterType: type.id });
      if (result.kind === "denied") onDenied();
      else if (result.kind === "invalid") setProblems(result.problems);
      else if (result.kind === "not-found") setProblems([{ field: "", message: "This provider no longer exists." }]);
      else await onSaved();
    } catch {
      setProblems([{ field: "", message: "The provider could not be saved. Is the app running?" }]);
    } finally {
      setSaving(false);
    }
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- handleSubmit catches its own failure
    <form aria-label={title} onSubmit={handleSubmit} className="card">
      <h4>{title}</h4>
      {!editing && types.length > 1 && (
        <div className="field">
          <label htmlFor={`type-${stage}`}>Provider type</label>
          <select id={`type-${stage}`} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
            {types.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={`name-${stage}`}>Name</label>
        <input id={`name-${stage}`} type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
      </div>
      {type?.fields.map((field) => {
        const id = `field-${stage}-${field.path.join("-")}`;
        return (
          <div className="field" key={id}>
            <label htmlFor={id}>{field.label}</label>
            <input id={id} type="text" value={values[field.path.join(".")] ?? ""} onChange={(event) => setValues({ ...values, [field.path.join(".")]: event.target.value })} />
            {field.help && <small>{field.help}</small>}
          </div>
        );
      })}
      <div className="field">
        <label htmlFor={`key-${stage}`}>API key</label>
        <input id={`key-${stage}`} type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        {editing && <small>Leave empty to keep the current key.</small>}
      </div>
      {problems.length > 0 && (
        <div role="alert" className="form-error">
          {problems.map((problem) => (
            <div key={problem.field + problem.message}>{problem.message}</div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          Save
        </button>{" "}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
