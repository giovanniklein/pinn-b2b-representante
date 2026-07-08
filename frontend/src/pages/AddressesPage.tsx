import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';

import { api } from '../api/client';

interface Endereco {
  id: string;
  descricao: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  complemento?: string | null;
  eh_principal: boolean;
}

interface EnderecoListResponse {
  items: Endereco[];
}

interface EnderecoFormValues {
  descricao: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  complemento?: string;
}

export function AddressesPage() {
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEndereco, setSelectedEndereco] = useState<Endereco | null>(null);

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EnderecoFormValues>();

  const loadEnderecos = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<EnderecoListResponse>('/enderecos/');
      setEnderecos(data.items);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Não foi possível carregar os endereços.';
      toast({
        title: 'Erro ao carregar endereços',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEnderecos();
  }, []);

  const openCreateModal = () => {
    setSelectedEndereco(null);
    reset({
      descricao: '',
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      complemento: '',
    });
    onOpen();
  };

  const openEditModal = (endereco: Endereco) => {
    setSelectedEndereco(endereco);
    reset({
      descricao: endereco.descricao,
      logradouro: endereco.logradouro,
      numero: endereco.numero,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      uf: endereco.uf,
      cep: endereco.cep,
      complemento: endereco.complemento ?? '',
    });
    onOpen();
  };

  const onSubmit: SubmitHandler<EnderecoFormValues> = async (values) => {
    try {
      if (selectedEndereco) {
        const { data } = await api.put<Endereco>(
          `/enderecos/${selectedEndereco.id}`,
          values,
        );
        toast({
          title: 'Endereço atualizado com sucesso',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        setEnderecos((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      } else {
        const { data } = await api.post<Endereco>('/enderecos/', values);
        toast({
          title: 'Endereço criado com sucesso',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        setEnderecos((prev) => [...prev, data]);
      }
      onClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Não foi possível salvar o endereço.';
      toast({
        title: 'Erro ao salvar endereço',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleDelete = async (endereco: Endereco) => {
    if (!window.confirm('Tem certeza que deseja remover este endereço?')) return;

    try {
      await api.delete(`/enderecos/${endereco.id}`);
      setEnderecos((prev) => prev.filter((e) => e.id !== endereco.id));
      toast({
        title: 'Endereço removido com sucesso',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Não foi possível remover o endereço.';
      toast({
        title: 'Erro ao remover endereço',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleDefinirPrincipal = async (endereco: Endereco) => {
    try {
      const { data } = await api.post<{ updated: boolean }>(
        `/enderecos/${endereco.id}/definir-principal`,
      );
      if (data.updated) {
        toast({
          title: 'Endereço principal atualizado',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        // Recarrega endereços para refletir mudança de principal
        await loadEnderecos();
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Não foi possível definir o endereço principal.';
      toast({
        title: 'Erro ao definir principal',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold">
            Meus endereços de entrega
          </Text>
          <Text color="gray.500" fontSize="sm">
            Cadastre e gerencie os endereços utilizados na entrega dos seus pedidos.
          </Text>
        </Box>

        <Button colorScheme="brand" onClick={openCreateModal}>
          Novo endereço
        </Button>
      </Flex>

      {isLoading && <Text>Carregando endereços...</Text>}

      {!isLoading && enderecos.length === 0 && (
        <Text>Nenhum endereço cadastrado até o momento.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {enderecos.map((endereco) => (
          <Box
            key={endereco.id}
            borderWidth="1px"
            borderRadius="md"
            p={4}
            bg="white"
            shadow="sm"
          >
            <Flex justify="space-between" align="center" mb={2}>
              <Text fontWeight="semibold">{endereco.descricao}</Text>
              {endereco.eh_principal && (
                <Badge colorScheme="green">Principal</Badge>
              )}
            </Flex>

            <Text fontSize="sm">
              {endereco.logradouro}, {endereco.numero}
            </Text>
            <Text fontSize="sm">
              {endereco.bairro} - {endereco.cidade}/{endereco.uf}
            </Text>
            <Text fontSize="sm">CEP: {endereco.cep}</Text>
            {endereco.complemento && (
              <Text fontSize="sm">Compl.: {endereco.complemento}</Text>
            )}

            <HStack spacing={3} mt={4}>
              <Button size="sm" onClick={() => openEditModal(endereco)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={() => handleDelete(endereco)}
              >
                Remover
              </Button>
              {!endereco.eh_principal && (
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="green"
                  onClick={() => handleDefinirPrincipal(endereco)}
                >
                  Definir como principal
                </Button>
              )}
            </HStack>
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {selectedEndereco ? 'Editar endereço' : 'Novo endereço'}
          </ModalHeader>
          <ModalBody>
            <form id="endereco-form" onSubmit={handleSubmit(onSubmit)}>
              <Stack spacing={4}>
                <FormControl isInvalid={!!errors.descricao}>
                  <FormLabel>Descrição</FormLabel>
                  <Input
                    {...register('descricao', { required: 'Informe a descrição' })}
                  />
                  <FormErrorMessage>
                    {errors.descricao && errors.descricao.message}
                  </FormErrorMessage>
                </FormControl>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isInvalid={!!errors.logradouro}>
                    <FormLabel>Logradouro</FormLabel>
                    <Input
                      {...register('logradouro', { required: 'Informe o logradouro' })}
                    />
                    <FormErrorMessage>
                      {errors.logradouro && errors.logradouro.message}
                    </FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={!!errors.numero}>
                    <FormLabel>Número</FormLabel>
                    <Input
                      {...register('numero', { required: 'Informe o número' })}
                    />
                    <FormErrorMessage>
                      {errors.numero && errors.numero.message}
                    </FormErrorMessage>
                  </FormControl>
                </SimpleGrid>

                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <FormControl isInvalid={!!errors.bairro}>
                    <FormLabel>Bairro</FormLabel>
                    <Input
                      {...register('bairro', { required: 'Informe o bairro' })}
                    />
                    <FormErrorMessage>
                      {errors.bairro && errors.bairro.message}
                    </FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={!!errors.cidade}>
                    <FormLabel>Cidade</FormLabel>
                    <Input
                      {...register('cidade', { required: 'Informe a cidade' })}
                    />
                    <FormErrorMessage>
                      {errors.cidade && errors.cidade.message}
                    </FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={!!errors.uf}>
                    <FormLabel>UF</FormLabel>
                    <Input
                      maxLength={2}
                      {...register('uf', { required: 'Informe a UF' })}
                    />
                    <FormErrorMessage>
                      {errors.uf && errors.uf.message}
                    </FormErrorMessage>
                  </FormControl>
                </SimpleGrid>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isInvalid={!!errors.cep}>
                    <FormLabel>CEP</FormLabel>
                    <Input
                      {...register('cep', { required: 'Informe o CEP' })}
                    />
                    <FormErrorMessage>
                      {errors.cep && errors.cep.message}
                    </FormErrorMessage>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Complemento</FormLabel>
                    <Input {...register('complemento')} />
                  </FormControl>
                </SimpleGrid>
              </Stack>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose} variant="ghost">
              Cancelar
            </Button>
            <Button
              colorScheme="brand"
              type="submit"
              form="endereco-form"
              isLoading={isSubmitting}
            >
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
