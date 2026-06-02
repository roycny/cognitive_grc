import { createTheme } from '@mui/material/styles'

/** Professional, calm enterprise palette: indigo primary + teal accent. */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3538CD', dark: '#252794', light: '#6366F1' },
    secondary: { main: '#0E9384' },
    background: { default: '#F6F7FB', paper: '#FFFFFF' },
    text: { primary: '#0F1324', secondary: '#5B6178' },
    divider: '#E6E8F0',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
})

export default theme
