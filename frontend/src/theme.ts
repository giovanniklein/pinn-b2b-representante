import { extendTheme, ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  fonts: {
    heading: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    body: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  colors: {
    brand: {
      50: '#e3f2ff',
      100: '#b3d4ff',
      200: '#81b5ff',
      300: '#4f96ff',
      400: '#267bff',
      500: '#0a61e6',
      600: '#024bb4',
      700: '#003581',
      800: '#001f4f',
      900: '#00091f',
    },
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'brand',
      },
    },
  },
});

export default theme;
