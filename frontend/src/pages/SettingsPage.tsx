import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { Cloud, Cpu, Settings as SettingsIcon } from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'

/** localStorage key the rest of the app reads to know which model to call. */
export const AI_MODEL_KEY = 'ai_model'

interface OllamaModel {
  name: string
  size?: number
}

const CLOUD_MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Recommended)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Efficiency)' },
]

const DEFAULT_MODEL = CLOUD_MODELS[0].value

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL)
  const [showSuccess, setShowSuccess] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(AI_MODEL_KEY)
    if (saved) setSelectedModel(saved)

    const fetchOllama = async () => {
      try {
        const { data } = await api.get('/ai/ollama-models')
        setOllamaModels(data.models || [])
      } catch {
        // No AI backend / Ollama not running — degrade gracefully.
        setOllamaModels([])
      } finally {
        setOllamaLoading(false)
      }
    }
    void fetchOllama()
  }, [])

  const handleChange = (e: SelectChangeEvent<string>) => {
    const model = e.target.value
    setSelectedModel(model)
    localStorage.setItem(AI_MODEL_KEY, model)
    setShowSuccess(true)
  }

  const isLocal = selectedModel.startsWith('ollama/')

  return (
    <Layout title="Settings">
      <Box sx={{ maxWidth: 760 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
          <SettingsIcon size={28} color="#3538CD" />
          <Typography variant="h4">Platform Settings</Typography>
        </Stack>

        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, pb: 2, mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
            AI Model Preferences
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Select the AI model that powers the platform&apos;s cognitive features — risk analysis, control
            recommendations, and document summarization. Choose a cloud model or a locally hosted Ollama model.
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} color="text.secondary">
              Active Provider:
            </Typography>
            {isLocal ? (
              <Chip
                icon={<Cpu size={14} />}
                label="Local (Ollama)"
                size="small"
                sx={{ bgcolor: 'rgba(14,147,132,0.12)', color: 'secondary.main', fontWeight: 600, '& .MuiChip-icon': { color: 'secondary.main' } }}
              />
            ) : (
              <Chip
                icon={<Cloud size={14} />}
                label="Cloud"
                size="small"
                sx={{ bgcolor: 'rgba(53,56,205,0.10)', color: 'primary.main', fontWeight: 600, '& .MuiChip-icon': { color: 'primary.main' } }}
              />
            )}
          </Stack>

          <FormControl fullWidth sx={{ maxWidth: 480 }}>
            <InputLabel id="model-select-label">Active AI Model</InputLabel>
            <Select
              labelId="model-select-label"
              value={selectedModel}
              label="Active AI Model"
              onChange={handleChange}
              sx={{ bgcolor: 'background.paper' }}
              renderValue={(selected) => {
                if (selected.startsWith('ollama/')) {
                  return (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Cpu size={16} color="#0E9384" />
                      <span>{selected.replace('ollama/', '')}</span>
                    </Stack>
                  )
                }
                const cloud = CLOUD_MODELS.find((m) => m.value === selected)
                return (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Cloud size={16} color="#3538CD" />
                    <span>{cloud?.label ?? selected}</span>
                  </Stack>
                )
              }}
            >
              <ListSubheader sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
                CLOUD MODELS
              </ListSubheader>
              {CLOUD_MODELS.map((m) => (
                <MenuItem key={m.value} value={m.value} sx={{ pl: 4 }}>
                  {m.label}
                </MenuItem>
              ))}

              <ListSubheader sx={{ fontWeight: 700, color: 'secondary.main', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
                LOCAL OLLAMA MODELS
                {ollamaLoading && <CircularProgress size={12} sx={{ ml: 1, color: 'secondary.main' }} />}
              </ListSubheader>
              {ollamaLoading ? (
                <MenuItem disabled sx={{ pl: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Checking for local models…
                  </Typography>
                </MenuItem>
              ) : ollamaModels.length === 0 ? (
                <MenuItem disabled sx={{ pl: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No local models detected
                  </Typography>
                </MenuItem>
              ) : (
                ollamaModels.map((m) => (
                  <MenuItem key={m.name} value={`ollama/${m.name}`} sx={{ pl: 4 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                      <span>{m.name}</span>
                      {m.size && <Chip label={formatSize(m.size)} size="small" sx={{ ml: 2, height: 20, fontSize: '0.7rem' }} />}
                    </Stack>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {isLocal && (
            <Alert severity="info" sx={{ mt: 2, maxWidth: 480 }}>
              You are using a local Ollama model. Ensure Ollama is running on your machine — local models run
              entirely on your hardware, with no data sent to external APIs.
            </Alert>
          )}
        </Paper>
      </Box>

      <Snackbar
        open={showSuccess}
        autoHideDuration={3000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
          AI model updated to: {isLocal ? selectedModel.replace('ollama/', '') : selectedModel}
        </Alert>
      </Snackbar>
    </Layout>
  )
}
