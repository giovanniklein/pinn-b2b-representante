import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>();

  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const setMe = useAuthStore((s) => s.setMe);

  const onSubmit: SubmitHandler<LoginFormValues> = async (values) => {
    try {
      const { data } = await api.post('/auth/login', {
        // Backend aceita `email` como alias de `login`.
        email: values.email,
        senha: values.password,
      });

      setSession(data);
      api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
      try {
        const { data: me } = await api.get('/auth/me');
        setMe(me);
      } catch {
        // If the profile fetch fails, keep the session and let the app retry later.
      }

      toast({
        title: 'Login realizado com sucesso',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      const from = (location.state as any)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ?? 'Não foi possível realizar o login. Verifique suas credenciais.';

      toast({
        title: 'Erro ao entrar',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  return (
    <Box bg="white" rounded="lg" shadow="md" p={8}>
      <Stack spacing={6}>
        <Box>
          <Text fontSize="xl" fontWeight="semibold" mb={1}>
            Acesse sua conta
          </Text>
          <Text fontSize="sm" color="gray.500">
            Entre para vender produtos dos parceiros participantes.
          </Text>
        </Box>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={4}>
            <FormControl isInvalid={!!errors.email}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                {...register('email', {
                  required: 'Informe o e-mail',
                })}
              />
              <FormErrorMessage>{errors.email && errors.email.message}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.password}>
              <FormLabel>Senha</FormLabel>
              <Input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password', {
                  required: 'Informe a senha',
                })}
              />
              <FormErrorMessage>{errors.password && errors.password.message}</FormErrorMessage>
            </FormControl>

            <Button type="submit" colorScheme="brand" isLoading={isSubmitting} w="full" mt={2}>
              Entrar
            </Button>

            <Button as={RouterLink} to="/register" colorScheme="brand" w="full">
              Criar minha conta
            </Button>
          </Stack>
        </form>
      </Stack>
    </Box>
  );
}
