import React, { useState } from 'react';
import { Product } from '../../../core/schema';
import { inventoryStore } from '../../../state/store';

interface ProductEditorProps {
    product: Product;
    onClose: () => void;
}

interface ValidationErrors {
    name?: string;
    priceTypical?: string;
    priceMin?: string;
    sku?: string;
}

function validateDraft(draft: Product): ValidationErrors {
    const errors: ValidationErrors = {};

    if (!draft.identity.name?.trim()) {
        errors.name = 'Le nom du produit est requis.';
    }

    const typical = draft.commercial?.priceRange?.typical;
    if (typical !== undefined && typical !== null) {
        if (!Number.isFinite(typical) || typical < 0) {
            errors.priceTypical = 'Le prix de vente doit être un nombre positif.';
        }
    }

    const min = draft.commercial?.priceRange?.min;
    if (min !== undefined && min !== null) {
        if (!Number.isFinite(min) || min < 0) {
            errors.priceMin = "Le prix d'achat doit être un nombre positif.";
        }
        if (typeof typical === 'number' && typeof min === 'number' && min > typical && typical > 0) {
            errors.priceMin = "Le prix d'achat ne peut pas dépasser le prix de vente.";
        }
    }

    return errors;
}

export const ProductEditor = ({ product, onClose }: ProductEditorProps) => {
    const [draft, setDraft] = useState<Product>(() => structuredClone(product));
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [isDirty, setIsDirty] = useState(false);

    const handleSave = () => {
        const validationErrors = validateDraft(draft);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }
        inventoryStore.updateProduct(draft);
        onClose();
    };

    const handleCancel = () => {
        if (isDirty) {
            const confirmed = window.confirm('Vous avez des modifications non sauvegardées. Quitter quand même ?');
            if (!confirmed) return;
        }
        onClose();
    };

    const setField = (section: keyof Product, field: string, value: unknown) => {
        setDraft(prev => ({
            ...prev,
            [section]: { ...(prev[section] as Record<string, unknown> ?? {}), [field]: value },
        }));
        setIsDirty(true);
        // Clear the error for this field on change
        setErrors(prev => {
            const next = { ...prev };
            if (field === 'name') delete next.name;
            return next;
        });
    };

    const setPriceField = (field: 'typical' | 'min' | 'max', raw: string) => {
        const value = raw === '' ? undefined : Number(raw);
        setDraft(prev => ({
            ...prev,
            commercial: {
                ...prev.commercial,
                priceRange: {
                    ...prev.commercial?.priceRange,
                    [field]: value,
                },
            },
        }));
        setIsDirty(true);
        setErrors(prev => {
            const next = { ...prev };
            if (field === 'typical') delete next.priceTypical;
            if (field === 'min') delete next.priceMin;
            return next;
        });
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
        borderRadius: '4px', boxSizing: 'border-box',
    };

    const errorInputStyle: React.CSSProperties = {
        ...inputStyle, border: '1px solid rgba(239,68,68,0.6)',
        background: 'rgba(239,68,68,0.06)',
    };

    const fieldStyle = (hasError: boolean): React.CSSProperties =>
        hasError ? errorInputStyle : inputStyle;

    return (
        <div className="product-editor" style={{ color: '#fff', padding: '16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                    Édition: <span style={{ color: '#b9a9ff' }}>{draft.identity.name || '—'}</span>
                    {isDirty && <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginLeft: '8px' }}>● non sauvegardé</span>}
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleCancel}
                        style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                        Annuler
                    </button>
                    <button onClick={handleSave}
                        style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Enregistrer
                    </button>
                </div>
            </div>

            {/* Validation summary */}
            {Object.keys(errors).length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.85rem', color: '#fca5a5' }}>
                    {Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}
                </div>
            )}

            <div className="product-editor-grid">
                {/* Identity */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#9898a8', marginBottom: '16px', marginTop: 0 }}>Identité</h3>

                    <Field label="Nom *" error={errors.name}>
                        <input type="text" value={draft.identity.name}
                            onChange={e => setField('identity', 'name', e.target.value)}
                            style={fieldStyle(!!errors.name)} />
                    </Field>

                    <Field label="Marque">
                        <input type="text" value={draft.identity.brand || ''}
                            onChange={e => setField('identity', 'brand', e.target.value)}
                            style={inputStyle} />
                    </Field>

                    <Field label="SKU">
                        <input type="text" value={draft.identity.sku || ''}
                            onChange={e => setField('identity', 'sku', e.target.value)}
                            style={inputStyle} />
                    </Field>

                    <Field label="Modèle">
                        <input type="text" value={draft.identity.model || ''}
                            onChange={e => setField('identity', 'model', e.target.value)}
                            style={inputStyle} />
                    </Field>
                </div>

                {/* Commercial */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#9898a8', marginBottom: '16px', marginTop: 0 }}>Commercial</h3>

                    <Field label="Prix de vente (DZD)" error={errors.priceTypical}>
                        <input type="number" min={0}
                            value={draft.commercial?.priceRange?.typical ?? ''}
                            onChange={e => setPriceField('typical', e.target.value)}
                            style={fieldStyle(!!errors.priceTypical)} />
                    </Field>

                    <Field label="Prix d'achat (DZD)" error={errors.priceMin}>
                        <input type="number" min={0}
                            value={draft.commercial?.priceRange?.min ?? ''}
                            onChange={e => setPriceField('min', e.target.value)}
                            style={fieldStyle(!!errors.priceMin)} />
                    </Field>

                    <Field label="Disponibilité">
                        <select value={draft.commercial?.availability || 'unknown'}
                            onChange={e => setField('commercial', 'availability', e.target.value)}
                            style={inputStyle}>
                            <option value="in_stock">En stock</option>
                            <option value="out_of_stock">Rupture</option>
                            <option value="unknown">Inconnu</option>
                        </select>
                    </Field>
                </div>

                {/* Enrichment */}
                <div className="product-editor-full" style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#9898a8', marginBottom: '16px', marginTop: 0 }}>Enrichissement (Manuel)</h3>

                    <Field label="Description Marketing / SEO">
                        <textarea value={draft.enrichment?.seoDescription || draft.enrichment?.description || ''}
                            onChange={e => setField('enrichment', 'seoDescription', e.target.value)}
                            rows={4}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                    </Field>

                    <Field label="Image Principale (URL)">
                        <input type="url"
                            value={draft.visual?.heroImage || ''}
                            onChange={e => setField('visual', 'heroImage', e.target.value)}
                            style={inputStyle}
                            placeholder="https://..." />
                    </Field>
                </div>
            </div>
        </div>
    );
};

// Reusable field wrapper with error display
const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: error ? '#fca5a5' : '#888', marginBottom: '4px' }}>
            {label}
        </label>
        {children}
        {error && <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '4px' }}>{error}</div>}
    </div>
);
