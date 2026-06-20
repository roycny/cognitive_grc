import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
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
import AssessmentIcon from '@mui/icons-material/Assessment';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
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

interface GapItem {
    requirement: string;
    gap_description: string;
    recommendation: string;
    severity: 'High' | 'Medium' | 'Low';
}

interface AssessmentResult {
    policy_name: string;
    framework: string;
    gaps: GapItem[];
}

interface SavedGap {
    id: number;
    policy_name: string;
    framework: string;
    requirement: string;
    gap_description: string;
    recommendation: string;
    severity: string;
    created_at: string;
    created_by: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, 'error' | 'warning' | 'success' | 'default'> = {
    High: 'error',
    Medium: 'warning',
    Low: 'success',
};

const SEVERITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

const ACCEPTED = '.pdf,.txt,.md';

/** The AI model selected in Settings (cloud "gemini-*" or local "ollama/<name>"). */
const getSavedModel = () => localStorage.getItem(AI_MODEL_KEY) || 'gemini-2.5-pro';

function SeverityChip({ severity }: { severity: string }) {
    return (
        <Chip
            label={severity}
            color={SEVERITY_COLOR[severity] ?? 'default'}
            size="small"
            sx={{ fontWeight: 700, minWidth: 64 }}
        />
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PolicyGapAgent() {
    const [tab, setTab] = useState(0); // 0 = Assess, 1 = Saved Gaps

    // Framework catalog
    const [frameworks, setFrameworks] = useState<string[]>([]);
    const [framework, setFramework] = useState('');

    // Assess inputs
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [policyName, setPolicyName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Assess state
    const [assessing, setAssessing] = useState(false);
    const [result, setResult] = useState<AssessmentResult | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [saving, setSaving] = useState(false);

    // Saved gaps
    const [savedGaps, setSavedGaps] = useState<SavedGap[]>([]);
    const [loadingGaps, setLoadingGaps] = useState(false);
    const [reviewGap, setReviewGap] = useState<SavedGap | null>(null);

    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';

    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'warning' | 'info' } | null>(null);

    // Load framework catalog once.
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<string[]>('/ai-tools/policy-gap/frameworks');
                setFrameworks(res.data);
                if (res.data.length) setFramework(res.data[0]);
            } catch {
                setSnack({ msg: 'Failed to load framework list.', sev: 'error' });
            }
        })();
    }, []);

    useEffect(() => {
        if (tab === 1) fetchSavedGaps();
    }, [tab]);

    const fetchSavedGaps = async () => {
        setLoadingGaps(true);
        try {
            const res = await api.get<SavedGap[]>('/ai-tools/policy-gap/gaps');
            setSavedGaps(res.data);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to fetch saved gaps.', sev: 'error' });
        } finally {
            setLoadingGaps(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        if (f && !policyName) setPolicyName(f.name.replace(/\.[^.]+$/, ''));
        setResult(null);
        setSelected(new Set());
    };

    const handleAssess = async () => {
        if (!file && !pastedText.trim()) {
            setSnack({ msg: 'Upload a policy file or paste policy text first.', sev: 'info' });
            return;
        }
        if (!framework) {
            setSnack({ msg: 'Select a framework.', sev: 'info' });
            return;
        }
        setAssessing(true);
        setResult(null);
        setSelected(new Set());
        try {
            const form = new FormData();
            form.append('framework', framework);
            form.append('policy_name', policyName);
            form.append('pasted_text', pastedText);
            form.append('model_name', getSavedModel());
            if (file) form.append('file', file);

            const res = await api.post<AssessmentResult>('/ai-tools/policy-gap/assess', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(res.data);
            setSelected(new Set(res.data.gaps.map((_, i) => i)));
            if (res.data.gaps.length === 0) {
                setSnack({ msg: `No gaps identified — policy looks aligned with ${framework}.`, sev: 'success' });
            }
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Assessment failed.', sev: 'error' });
        } finally {
            setAssessing(false);
        }
    };

    const toggle = (idx: number) =>
        setSelected(prev => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });

    const handleSave = async () => {
        if (!result || selected.size === 0) return;
        setSaving(true);
        try {
            await api.post('/ai-tools/policy-gap/gaps', {
                policy_name: result.policy_name,
                framework: result.framework,
                gaps: result.gaps.filter((_, i) => selected.has(i)),
            });
            setSnack({ msg: `Saved ${selected.size} gap(s) to the register.`, sev: 'success' });
            setResult(null);
            setFile(null);
            setPastedText('');
            setPolicyName('');
            setSelected(new Set());
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTab(1);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Save failed.', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const deleteGap = useCallback(async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Delete this saved gap? This cannot be undone.')) return;
        try {
            await api.delete(`/ai-tools/policy-gap/gaps/${id}`);
            setSavedGaps(prev => prev.filter(g => g.id !== id));
            setSnack({ msg: 'Gap deleted.', sev: 'success' });
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Delete failed.', sev: 'error' });
        }
    }, []);

    const sortedGaps = result
        ? result.gaps
              .map((g, i) => ({ g, i }))
              .sort((a, b) => (SEVERITY_ORDER[a.g.severity] ?? 9) - (SEVERITY_ORDER[b.g.severity] ?? 9))
        : [];

    return (
        <Layout title="Policy Gap Analyst">
            <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <AssessmentIcon color="primary" sx={{ fontSize: 32 }} />
                    <Box>
                        <Typography variant="h5" fontWeight={700}>Policy Gap Analyst</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Assess a policy document against a control framework and surface gaps, with severity and remediation guidance.
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                        <Tab label="Assess Policy" icon={<AssessmentIcon fontSize="small" />} iconPosition="start" />
                        <Tab label="Saved Gaps" icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
                    </Tabs>
                </Box>

                {tab === 0 && (
                    <>
                        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                                <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
                                    <InputLabel id="framework-label">Framework</InputLabel>
                                    <Select
                                        labelId="framework-label"
                                        label="Framework"
                                        value={framework}
                                        onChange={e => setFramework(e.target.value)}
                                    >
                                        {frameworks.map(f => (
                                            <MenuItem key={f} value={f}>{f}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Policy Name"
                                    placeholder="Auto-filled from filename"
                                    value={policyName}
                                    onChange={e => setPolicyName(e.target.value)}
                                    size="small"
                                    sx={{ minWidth: 260, flex: 1 }}
                                />
                            </Box>

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
                                    {file ? file.name : 'Click to upload a policy document (PDF, TXT, MD)'}
                                </Typography>
                            </Box>

                            <Typography variant="caption" color="text.secondary">Or paste policy text</Typography>
                            <TextField
                                value={pastedText}
                                onChange={e => setPastedText(e.target.value)}
                                placeholder="Paste the policy content here…"
                                multiline minRows={4} fullWidth size="small" sx={{ mt: 0.5, mb: 2 }}
                            />

                            <Button
                                variant="contained"
                                startIcon={assessing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                                onClick={handleAssess}
                                disabled={assessing || isViewer}
                            >
                                {assessing ? 'Analysing…' : 'Assess Policy'}
                            </Button>
                            {isViewer && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                    Viewers cannot run assessments.
                                </Typography>
                            )}
                        </Paper>

                        {result && (
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                                    <Box sx={{ mr: 'auto' }}>
                                        <Typography variant="h6" fontWeight={700}>
                                            Results — {result.policy_name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            <Chip label={result.framework} size="small" variant="outlined" color="primary" sx={{ mr: 1 }} />
                                            {result.gaps.length} gap{result.gaps.length !== 1 ? 's' : ''} · {selected.size} selected
                                        </Typography>
                                    </Box>
                                    <Button
                                        variant="outlined"
                                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                        onClick={handleSave}
                                        disabled={saving || selected.size === 0}
                                    >
                                        Save Selected ({selected.size})
                                    </Button>
                                </Box>

                                {result.gaps.length === 0 ? (
                                    <Alert severity="success">No gaps identified — the policy appears aligned with {result.framework}.</Alert>
                                ) : (
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            size="small"
                                                            checked={selected.size === result.gaps.length}
                                                            indeterminate={selected.size > 0 && selected.size < result.gaps.length}
                                                            onChange={() =>
                                                                setSelected(
                                                                    selected.size === result.gaps.length
                                                                        ? new Set()
                                                                        : new Set(result.gaps.map((_, i) => i)),
                                                                )
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell><Typography variant="subtitle2">Severity</Typography></TableCell>
                                                    <TableCell><Typography variant="subtitle2">Requirement</Typography></TableCell>
                                                    <TableCell><Typography variant="subtitle2">Gap</Typography></TableCell>
                                                    <TableCell><Typography variant="subtitle2">Recommendation</Typography></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {sortedGaps.map(({ g, i }) => (
                                                    <TableRow key={i} hover selected={selected.has(i)} sx={{ '& > td': { verticalAlign: 'top' } }}>
                                                        <TableCell padding="checkbox">
                                                            <Checkbox size="small" checked={selected.has(i)} onChange={() => toggle(i)} />
                                                        </TableCell>
                                                        <TableCell><SeverityChip severity={g.severity} /></TableCell>
                                                        <TableCell sx={{ maxWidth: 200 }}>
                                                            <Typography variant="body2" fontWeight={600}>{g.requirement}</Typography>
                                                        </TableCell>
                                                        <TableCell sx={{ maxWidth: 300 }}>
                                                            <Typography variant="body2" color="text.secondary">{g.gap_description}</Typography>
                                                        </TableCell>
                                                        <TableCell sx={{ maxWidth: 300 }}>
                                                            <Typography variant="body2" color="text.secondary">{g.recommendation}</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Paper>
                        )}
                    </>
                )}

                {tab === 1 && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell><Typography variant="subtitle2">Policy</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Framework</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Severity</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Requirement</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Saved By</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Date</Typography></TableCell>
                                    <TableCell align="right"><Typography variant="subtitle2">Actions</Typography></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingGaps ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}><CircularProgress size={24} /></TableCell>
                                    </TableRow>
                                ) : savedGaps.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                No saved gaps yet. Run an assessment and save gaps to review them here.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    savedGaps.map(gap => (
                                        <TableRow key={gap.id} hover sx={{ cursor: 'pointer' }} onClick={() => setReviewGap(gap)}>
                                            <TableCell><Typography variant="body2" fontWeight={600}>{gap.policy_name}</Typography></TableCell>
                                            <TableCell><Chip label={gap.framework} size="small" variant="outlined" color="primary" /></TableCell>
                                            <TableCell><SeverityChip severity={gap.severity} /></TableCell>
                                            <TableCell sx={{ maxWidth: 240 }}>
                                                <Typography variant="body2" noWrap>{gap.requirement}</Typography>
                                            </TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{gap.created_by}</Typography></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{new Date(gap.created_at).toLocaleDateString()}</Typography></TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Review">
                                                    <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); setReviewGap(gap); }}>
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {!isViewer && (
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" color="error" onClick={(e) => deleteGap(gap.id, e)}>
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
                <Dialog open={!!reviewGap} onClose={() => setReviewGap(null)} maxWidth="md" fullWidth>
                    <DialogTitle>Gap Details — {reviewGap?.policy_name}</DialogTitle>
                    <DialogContent dividers>
                        {reviewGap && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                                    <Chip label={reviewGap.framework} size="small" variant="outlined" color="primary" />
                                    <SeverityChip severity={reviewGap.severity} />
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>REQUIREMENT</Typography>
                                    <Typography variant="body2" fontWeight={600}>{reviewGap.requirement}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>GAP / DISCREPANCY</Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{reviewGap.gap_description}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>RECOMMENDATION</Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{reviewGap.recommendation}</Typography>
                                </Box>
                                <Divider />
                                <Typography variant="caption" color="text.secondary">
                                    Saved by {reviewGap.created_by} on {new Date(reviewGap.created_at).toLocaleString()}
                                </Typography>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setReviewGap(null)}>Close</Button>
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
