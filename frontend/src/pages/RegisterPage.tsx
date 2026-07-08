import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, SearchIcon } from '@chakra-ui/icons';
import { useState } from 'react';
import { SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface EnderecoExtraForm {
  descricao: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  complemento?: string;
}

interface RegisterFormValues {
  cnpj: string;
  email: string;
  telefone?: string;
  senha: string;
  confirmar_senha: string;

  // Dados retornados pela API de CNPJ (ajustáveis pelo usuário)
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  complemento?: string;

  enderecos_extras: EnderecoExtraForm[];
}

export function RegisterPage() {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      enderecos_extras: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'enderecos_extras',
  });

  const toast = useToast();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);

  const cnpjValue = watch('cnpj');

  const handleBuscarCnpj = async () => {
    if (!cnpjValue) {
      toast({
        title: 'Informe o CNPJ',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const somenteDigitos = cnpjValue.replace(/\D/g, '');

    if (somenteDigitos.length !== 14) {
      toast({
        title: 'CNPJ inválido',
        description: 'Informe um CNPJ com 14 dígitos.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsFetchingCnpj(true);

      const { data } = await api.get(`https://publica.cnpj.ws/cnpj/${somenteDigitos}`);

      setValue('razao_social', data.razao_social ?? '');

      const estabelecimento = data.estabelecimento ?? {};
      const cidade = estabelecimento.cidade ?? {};
      const estado = estabelecimento.estado ?? {};

      setValue('nome_fantasia', estabelecimento.nome_fantasia ?? data.razao_social ?? '');
      setValue('logradouro', estabelecimento.logradouro ?? '');
      setValue('numero', estabelecimento.numero ?? '');
      setValue('bairro', estabelecimento.bairro ?? '');
      setValue('cidade', cidade.nome ?? '');
      setValue('uf', estado.sigla ?? '');
      setValue('cep', estabelecimento.cep ?? '');
      setValue('complemento', estabelecimento.complemento ?? '');
      setValue('telefone', estabelecimento.telefone1 ?? estabelecimento.telefone2 ?? '');
      setValue('email', estabelecimento.email ?? '');

      toast({
        title: 'Dados carregados pelo CNPJ',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ?? 'Não foi possível buscar os dados do CNPJ.';
      toast({
        title: 'Erro ao buscar CNPJ',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const onSubmit: SubmitHandler<RegisterFormValues> = async (values) => {
    if (values.senha !== values.confirmar_senha) {
      toast({
        title: 'As senhas não conferem',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const payload = {
        cnpj: values.cnpj,
        email: values.email,
        telefone: values.telefone,
        senha: values.senha,
        enderecos_extras: values.enderecos_extras,
      };

      const { data } = await api.post('/auth/register', payload);
      await setSession(data);

      toast({
        title: 'Conta criada com sucesso',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      navigate('/produtos', { replace: true });
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ?? 'Não foi possível concluir o registro.';
      toast({
        title: 'Erro ao registrar',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleAdicionarEnderecoExtra = () => {
    append({
      descricao: '',
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      complemento: '',
    });
  };

  return (
    <Box bg="white" rounded="lg" shadow="md" p={8} maxW="6xl">
      <Stack spacing={6}>
        <Box>
          <Text fontSize="xl" fontWeight="semibold" mb={1}>
            Crie sua conta de representante
          </Text>
          <Text fontSize="sm" color="gray.500">
            Utilize o CNPJ para auto-preencher os dados da sua empresa e cadastre seus
            endereços de entrega.
          </Text>
        </Box>

        <VStack align="stretch" spacing={6}>
          <Stack direction={{ base: 'column', md: 'row' }} align="flex-end" spacing={3}>
            <FormControl flex="1" w="full" isInvalid={!!errors.cnpj}>
              <FormLabel>CNPJ</FormLabel>
              <Input
                placeholder="00.000.000/0001-91"
                {...register('cnpj', { required: 'Informe o CNPJ' })}
              />
              <FormErrorMessage>{errors.cnpj && errors.cnpj.message}</FormErrorMessage>
            </FormControl>
            <Button
              leftIcon={<SearchIcon />}
              onClick={handleBuscarCnpj}
              isLoading={isFetchingCnpj}
              colorScheme="brand"
              flexShrink={0}
              w={{ base: 'full', md: 'auto' }}
            >
              Buscar dados do CNPJ
            </Button>
          </Stack>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={6}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Razão social</FormLabel>
                  <Input {...register('razao_social')} />
                </FormControl>

                <FormControl>
                  <FormLabel>Nome fantasia</FormLabel>
                  <Input {...register('nome_fantasia')} />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                <FormControl>
                  <FormLabel>Logradouro</FormLabel>
                  <Input {...register('logradouro')} />
                </FormControl>
                <FormControl>
                  <FormLabel>Número</FormLabel>
                  <Input {...register('numero')} />
                </FormControl>
                <FormControl>
                  <FormLabel>Bairro</FormLabel>
                  <Input {...register('bairro')} />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                <FormControl>
                  <FormLabel>Cidade</FormLabel>
                  <Input {...register('cidade')} />
                </FormControl>
                <FormControl>
                  <FormLabel>UF</FormLabel>
                  <Input maxLength={2} {...register('uf')} />
                </FormControl>
                <FormControl>
                  <FormLabel>CEP</FormLabel>
                  <Input {...register('cep')} />
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel>Complemento</FormLabel>
                <Textarea rows={2} {...register('complemento')} />
              </FormControl>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isInvalid={!!errors.email}>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    autoComplete="email"
                    {...register('email', { required: 'Informe o e-mail' })}
                  />
                  <FormErrorMessage>
                    {errors.email && errors.email.message}
                  </FormErrorMessage>
                </FormControl>
                <FormControl>
                  <FormLabel>Telefone</FormLabel>
                  <Input {...register('telefone')} />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isInvalid={!!errors.senha}>
                  <FormLabel>Senha</FormLabel>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...register('senha', { required: 'Informe a senha' })}
                  />
                  <FormErrorMessage>
                    {errors.senha && errors.senha.message}
                  </FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={!!errors.confirmar_senha}>
                  <FormLabel>Confirmar senha</FormLabel>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...register('confirmar_senha', {
                      required: 'Confirme a senha',
                    })}
                  />
                  <FormErrorMessage>
                    {errors.confirmar_senha && errors.confirmar_senha.message}
                  </FormErrorMessage>
                </FormControl>
              </SimpleGrid>

              <Box>
                <Text fontSize="md" fontWeight="medium" mb={3}>
                  Endereços de Entrega Extras
                </Text>

                <Stack spacing={4}>
                  {fields.map((field, index) => (
                    <Box
                      key={field.id}
                      borderWidth="1px"
                      borderRadius="md"
                      p={4}
                      position="relative"
                    >
                      <IconButton
                        aria-label="Remover endereço"
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        position="absolute"
                        top={2}
                        right={2}
                        onClick={() => remove(index)}
                      />

                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mb={3}>
                        <FormControl isRequired>
                          <FormLabel>Descrição</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.descricao` as const, {
                              required: 'Informe a descrição do endereço',
                            })}
                          />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Logradouro</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.logradouro` as const, {
                              required: 'Informe o logradouro',
                            })}
                          />
                        </FormControl>
                      </SimpleGrid>

                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={3}>
                        <FormControl isRequired>
                          <FormLabel>Número</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.numero` as const, {
                              required: 'Informe o número',
                            })}
                          />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Bairro</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.bairro` as const, {
                              required: 'Informe o bairro',
                            })}
                          />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Cidade</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.cidade` as const, {
                              required: 'Informe a cidade',
                            })}
                          />
                        </FormControl>
                      </SimpleGrid>

                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                        <FormControl isRequired>
                          <FormLabel>UF</FormLabel>
                          <Input
                            maxLength={2}
                            {...register(`enderecos_extras.${index}.uf` as const, {
                              required: 'Informe a UF',
                            })}
                          />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>CEP</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.cep` as const, {
                              required: 'Informe o CEP',
                            })}
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Complemento</FormLabel>
                          <Input
                            {...register(`enderecos_extras.${index}.complemento` as const)}
                          />
                        </FormControl>
                      </SimpleGrid>
                    </Box>
                  ))}

                  <Button
                    leftIcon={<AddIcon />}
                    onClick={handleAdicionarEnderecoExtra}
                    variant="outline"
                    alignSelf="flex-start"
                  >
                    Adicionar endereço extra
                  </Button>
                </Stack>
              </Box>

              <Button
                type="submit"
                colorScheme="brand"
                isLoading={isSubmitting}
                w="full"
                mt={2}
              >
                Criar Minha Conta
              </Button>
            </Stack>
          </form>
        </VStack>
      </Stack>
    </Box>
  );
}
