import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GavelIcon from '@mui/icons-material/Gavel';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AI_MODEL_KEY } from './SettingsPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuidanceItem {
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
}

interface EvidenceItem {
    document: string;
    description: string;
    attention_points: string;
}

interface ControlReference {
    framework: string;
    control_id: string;
    control_name: string;
    relevance: string;
}

interface AnalysisResult {
    title: string;
    input_type: string;
    summary: string;
    risk_rating: string;
    guidance: GuidanceItem[];
    evidence_suggestions: EvidenceItem[];
    control_references: ControlReference[];
}

interface SavedResponse {
    id: number;
    title: string;
    input_type: string;
    frameworks_referenced: string[];
    risk_rating: string;
    summary: string;
    guidance: GuidanceItem[];
    evidence_suggestions: EvidenceItem[];
    control_references: ControlReference[];
    created_at: string;
    created_by: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_COLOR: Record<string, 'error' | 'warning' | 'success' | 'default'> = {
    High: 'error',
    Medium: 'warning',
    Low: 'success',
};

const RISK_COLOR: Record<string, { bg: string; fg: string }> = {
    Critical: { bg: 'rgba(198,40,40,0.12)', fg: '#C62828' },
    High: { bg: 'rgba(230,81,0,0.12)', fg: '#E65100' },
    Medium: { bg: 'rgba(249,168,37,0.16)', fg: '#B7791F' },
    Low: { bg: 'rgba(46,125,50,0.12)', fg: '#2E7D32' },
};

const ACCEPTED = '.pdf,.txt,.md';
const getSavedModel = () => localStorage.getItem(AI_MODEL_KEY) || 'gemini-3.5-flash';

const INPUT_TYPES = [
    { value: 'audit_request', label: 'Audit Request / Information Request' },
    { value: 'audit_observation', label: 'Audit Observation / Finding' },
];

function RiskPill({ value }: { value: string }) {
    const c = RISK_COLOR[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' };
    return (
        <Box
            component="span"
            sx={{ px: 1.5, py: 0.4, borderRadius: 1.5, fontSize: 12, fontWeight: 700, bgcolor: c.bg, color: c.fg }}
        >
            {value}
        </Box>
    );
}

function PriorityChip({ priority }: { priority: string }) {
    return (
        <Chip
            label={priority}
            color={PRIORITY_COLOR[priority] ?? 'default'}
            size="small"
            sx={{ fontWeight: 700, minWidth: 64 }}
        />
    );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({ title, count, children, defaultOpen = true }: {
    title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Box sx={{ mb: 2 }}>
            <Box
                onClick={() => setOpen(!open)}
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 1, mb: 0.5 }}
            >
                <ExpandMoreIcon
                    fontSize="small"
                    sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: '0.2s' }}
                />
                <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
                {count !== undefined && (
                    <Chip label={count} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                )}
            </Box>
            <Collapse in={open}>{children}</Collapse>
        </Box>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AuditDisputeAgent() {
    const [tab, setTab] = useState(0);

    // Inputs
    const [inputType, setInputType] = useState('audit_request');
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Analysis state
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [saving, setSaving] = useState(false);

    // History
    const [history, setHistory] = useState<SavedResponse[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [reviewItem, setReviewItem] = useState<SavedResponse | null>(null);

    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'warning' | 'info' } | null>(null);

    useEffect(() => {
        if (tab === 1) fetchHistory();
    }, [tab]);

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await api.get<SavedResponse[]>('/ai-tools/audit-dispute/history');
            setHistory(res.data);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to fetch history.', sev: 'error' });
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
        setResult(null);
    };

    const handleAnalyze = async () => {
        if (!file && !pastedText.trim()) {
            setSnack({ msg: 'Upload a file or paste audit text first.', sev: 'info' });
            return;
        }
        setAnalyzing(true);
        setResult(null);
        try {
            const form = new FormData();
            form.append('input_type', inputType);
            form.append('title', title);
            form.append('pasted_text', pastedText);
            form.append('model_name', getSavedModel());
            if (file) form.append('file', file);

            const res = await api.post<AnalysisResult>('/ai-tools/audit-dispute/analyze', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(res.data);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Analysis failed.', sev: 'error' });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleSave = async () => {
        if (!result) return;
        setSaving(true);
        try {
            await api.post('/ai-tools/audit-dispute/save', result);
            setSnack({ msg: 'Response saved successfully.', sev: 'success' });
            setResult(null);
            setFile(null);
            setPastedText('');
            setTitle('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTab(1);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Save failed.', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const deleteResponse = useCallback(async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Delete this saved response? This cannot be undone.')) return;
        try {
            await api.delete(`/ai-tools/audit-dispute/history/${id}`);
            setHistory(prev => prev.filter(r => r.id !== id));
            setSnack({ msg: 'Response deleted.', sev: 'success' });
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Delete failed.', sev: 'error' });
        }
    }, []);

    const renderResultContent = (data: AnalysisResult | SavedResponse) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Summary */}
            <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>EXECUTIVE SUMMARY</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{data.summary}</Typography>
            </Box>

            <Divider />

            {/* Guidance */}
            <Section title="Guidance & Recommendations" count={data.guidance.length}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ width: 80 }}><Typography variant="subtitle2">Priority</Typography></TableCell>
                                <TableCell sx={{ width: 200 }}><Typography variant="subtitle2">Title</Typography></TableCell>
                                <TableCell><Typography variant="subtitle2">Description</Typography></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.guidance
                                .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 9) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 9))
                                .map((g, i) => (
                                    <TableRow key={i} sx={{ '& > td': { verticalAlign: 'top' } }}>
                                        <TableCell><PriorityChip priority={g.priority} /></TableCell>
                                        <TableCell><Typography variant="body2" fontWeight={600}>{g.title}</Typography></TableCell>
                                        <TableCell><Typography variant="body2" color="text.secondary">{g.description}</Typography></TableCell>
                                    </TableRow>
                                ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Section>

            {/* Evidence */}
            <Section title="Evidence & Procedures" count={data.evidence_suggestions.length}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ width: 220 }}><Typography variant="subtitle2">Document / Artifact</Typography></TableCell>
                                <TableCell><Typography variant="subtitle2">Description</Typography></TableCell>
                                <TableCell sx={{ width: 280 }}><Typography variant="subtitle2">Attention Points</Typography></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.evidence_suggestions.map((e, i) => (
                                <TableRow key={i} sx={{ '& > td': { verticalAlign: 'top' } }}>
                                    <TableCell><Typography variant="body2" fontWeight={600}>{e.document}</Typography></TableCell>
                                    <TableCell><Typography variant="body2" color="text.secondary">{e.description}</Typography></TableCell>
                                    <TableCell><Typography variant="body2" color="text.secondary">{e.attention_points}</Typography></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Section>

            {/* Control References */}
            <Section title="Framework Control References" count={data.control_references.length}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ width: 120 }}><Typography variant="subtitle2">Framework</Typography></TableCell>
                                <TableCell sx={{ width: 120 }}><Typography variant="subtitle2">Control ID</Typography></TableCell>
                                <TableCell sx={{ width: 180 }}><Typography variant="subtitle2">Control Name</Typography></TableCell>
                                <TableCell><Typography variant="subtitle2">Relevance</Typography></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.control_references.map((c, i) => (
                                <TableRow key={i} sx={{ '& > td': { verticalAlign: 'top' } }}>
                                    <TableCell>
                                        <Chip
                                            label={c.framework}
                                            size="small"
                                            variant="outlined"
                                            color={c.framework.includes('NIST') ? 'primary' : 'secondary'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600} fontFamily="monospace">{c.control_id}</Typography>
                                    </TableCell>
                                    <TableCell><Typography variant="body2">{c.control_name}</Typography></TableCell>
                                    <TableCell><Typography variant="body2" color="text.secondary">{c.relevance}</Typography></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Section>
        </Box>
    );

    return (
        <Layout title="Audit Dispute Agent">
            <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <GavelIcon color="primary" sx={{ fontSize: 32 }} />
                    <Box>
                        <Typography variant="h5" fontWeight={700}>Audit Dispute Agent</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Analyze audit requests or observations with OCC CSW and NIST CSF 2.0 references, evidence guidance, and dispute support.
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                        <Tab label="Analyze" icon={<GavelIcon fontSize="small" />} iconPosition="start" />
                        <Tab label="Saved Responses" icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
                    </Tabs>
                </Box>

                {/* ── Analyze tab ─────────────────────────────────────── */}
                {tab === 0 && (
                    <>
                        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                                <FormControl size="small" sx={{ minWidth: 300, flex: 1 }}>
                                    <InputLabel id="input-type-label">Type</InputLabel>
                                    <Select
                                        labelId="input-type-label"
                                        label="Type"
                                        value={inputType}
                                        onChange={e => { setInputType(e.target.value); setResult(null); }}
                                    >
                                        {INPUT_TYPES.map(t => (
                                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Title"
                                    placeholder="e.g. Access Control Review Finding #3"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    size="small"
                                    sx={{ minWidth: 300, flex: 1 }}
                                />
                            </Box>

                            <Alert severity="info" sx={{ mb: 2 }}>
                                {inputType === 'audit_observation'
                                    ? 'Paste an audit observation or finding. The agent will help build a dispute response with mitigating controls and lower-risk justification.'
                                    : 'Paste an audit request or information request. The agent will map it to frameworks and guide you on procedures, evidence, and attention areas.'}
                            </Alert>

                            <Box
                                onClick={() => fileInputRef.current?.click()}
                                sx={{
                                    p: 2.5, mb: 2, textAlign: 'center', border: '2px dashed',
                                    borderColor: 'divider', borderRadius: 1, cursor: 'pointer',
                                    '&:hover': { borderColor: 'primary.main' },
                                }}
                            >
                                <input
                                    type="file" ref={fileInputRef} style={{ display: 'none' }}
                                    accept={ACCEPTED} onChange={handleFileChange}
                                />
                                <UploadFileIcon sx={{ color: 'text.disabled', mb: 0.5 }} />
                                <Typography variant="body2" color="text.secondary">
                                    {file ? file.name : 'Click to upload an audit document (PDF, TXT, MD)'}
                                </Typography>
                            </Box>

                            <Typography variant="caption" color="text.secondary">Or paste audit text</Typography>
                            <TextField
                                value={pastedText}
                                onChange={e => setPastedText(e.target.value)}
                                placeholder={inputType === 'audit_observation'
                                    ? 'Paste the audit observation / finding text here...'
                                    : 'Paste the audit request / information request here...'}
                                multiline minRows={5} fullWidth size="small" sx={{ mt: 0.5, mb: 2 }}
                            />

                            <Button
                                variant="contained"
                                startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                                onClick={handleAnalyze}
                                disabled={analyzing || isViewer}
                            >
                                {analyzing ? 'Analyzing...' : 'Analyze'}
                            </Button>
                            {isViewer && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                    Viewers cannot run analyses.
                                </Typography>
                            )}
                        </Paper>

                        {result && (
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
                                    <Box sx={{ mr: 'auto' }}>
                                        <Typography variant="h6" fontWeight={700}>{result.title}</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                            <Chip
                                                label={result.input_type === 'audit_observation' ? 'Observation' : 'Request'}
                                                size="small" variant="outlined"
                                                color={result.input_type === 'audit_observation' ? 'warning' : 'primary'}
                                            />
                                            <RiskPill value={result.risk_rating} />
                                        </Box>
                                    </Box>
                                    <Button
                                        variant="outlined"
                                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                        onClick={handleSave}
                                        disabled={saving}
                                    >
                                        Save Response
                                    </Button>
                                </Box>

                                {renderResultContent(result)}
                            </Paper>
                        )}
                    </>
                )}

                {/* ── History tab ─────────────────────────────────────── */}
                {tab === 1 && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell><Typography variant="subtitle2">Title</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Type</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Risk</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Frameworks</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Saved By</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Date</Typography></TableCell>
                                    <TableCell align="right"><Typography variant="subtitle2">Actions</Typography></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingHistory ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}><CircularProgress size={24} /></TableCell>
                                    </TableRow>
                                ) : history.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                No saved responses yet. Run an analysis and save the response to review it here.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    history.map(item => (
                                        <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => setReviewItem(item)}>
                                            <TableCell><Typography variant="body2" fontWeight={600}>{item.title}</Typography></TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={item.input_type === 'audit_observation' ? 'Observation' : 'Request'}
                                                    size="small" variant="outlined"
                                                    color={item.input_type === 'audit_observation' ? 'warning' : 'primary'}
                                                />
                                            </TableCell>
                                            <TableCell><RiskPill value={item.risk_rating} /></TableCell>
                                            <TableCell>
                                                {item.frameworks_referenced?.map((f, i) => (
                                                    <Chip key={i} label={f} size="small" variant="outlined" sx={{ mr: 0.5 }} />
                                                ))}
                                            </TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{item.created_by}</Typography></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{new Date(item.created_at).toLocaleDateString()}</Typography></TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Review">
                                                    <IconButton size="small" color="primary" onClick={e => { e.stopPropagation(); setReviewItem(item); }}>
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {!isViewer && (
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" color="error" onClick={e => deleteResponse(item.id, e)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {/* Review dialog */}
                <Dialog open={!!reviewItem} onClose={() => setReviewItem(null)} maxWidth="lg" fullWidth>
                    <DialogTitle>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Typography variant="h6" fontWeight={700} sx={{ mr: 'auto' }}>{reviewItem?.title}</Typography>
                            {reviewItem && (
                                <>
                                    <Chip
                                        label={reviewItem.input_type === 'audit_observation' ? 'Observation' : 'Request'}
                                        size="small" variant="outlined"
                                        color={reviewItem.input_type === 'audit_observation' ? 'warning' : 'primary'}
                                    />
                                    <RiskPill value={reviewItem.risk_rating} />
                                </>
                            )}
                        </Box>
                    </DialogTitle>
                    <DialogContent dividers>
                        {reviewItem && renderResultContent(reviewItem)}
                        {reviewItem && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                                Saved by {reviewItem.created_by} on {new Date(reviewItem.created_at).toLocaleString()}
                            </Typography>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setReviewItem(null)}>Close</Button>
                    </DialogActions>
                </Dialog>

                <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                    <Alert severity={snack?.sev ?? 'info'} onClose={() => setSnack(null)} variant="filled">
                        {snack?.msg}
                    </Alert>
                </Snackbar>
            </Box>
        </Layout>
    );
}
