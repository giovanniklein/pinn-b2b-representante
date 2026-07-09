import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
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

import { api } from '../api/client';

interface Cliente {
  id: string;
  nome: string;
  cnpj?: string | null;
  email?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

interface ClienteListResponse {
  items: Cliente[];
  total: number;
}

interface FormState {
  cnpj: string;
  email: string;
  telefone: string;
  senha: string;
  razao_social: string;
  nome_fantasia: string;
  cidade: string;
  uf: string;
}

const emptyForm: FormState = {
  cnpj: '',
  email: '',
  telefone: '',
  senha: '',
  razao_social: '',
  nome_fantasia: '',
  cidade: '',
  uf: '',
};

export function ClientsPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const carregar = async (q?: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.get<ClienteListResponse>('/gestao/clientes', {
        params: { q: q || undefined, page_size: 100 },
      });
      setClientes(data.items ?? []);
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar clientes',
        description: err?.response?.data?.detail ?? 'Tente novamente.',
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirNovo = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowSenha(false);
    onOpen();
  };

  const abrirEdicao = (c: Cliente) => {
    setEditing(c);
    setForm({
      ...emptyForm,
      cnpj: c.cnpj ?? '',
      email: c.email ?? '',
      nome_fantasia: c.nome ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
    });
    onOpen();
  };

  const salvar = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/gestao/clientes/${editing.id}`, {
          nome_fantasia: form.nome_fantasia || undefined,
          razao_social: form.razao_social || undefined,
          telefone: form.telefone || undefined,
        });
        toast({ title: 'Cliente atualizado', status: 'success' });
      } else {
        await api.post('/gestao/clientes', {
          cnpj: form.cnpj,
          email: form.email,
          telefone: form.telefone || undefined,
          senha: form.senha,
          razao_social: form.razao_social || undefined,
          nome_fantasia: form.nome_fantasia || undefined,
          cidade: form.cidade || undefined,
          uf: form.uf || undefined,
        });
        toast({ title: 'Cliente cadastrado', status: 'success' });
      }
      onClose();
      await carregar(busca);
    } catch (err: any) {
      toast({
        title: 'Não foi possível salvar',
        description: err?.response?.data?.detail ?? 'Verifique os dados e tente novamente.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const podeSalvar = editing
    ? true
    : form.cnpj.trim() && form.email.trim() && form.senha.trim().length >= 4;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
        <Box>
          <Text fontSize="2xl" fontWeight="bold">Meus clientes</Text>
          <Text color="gray.500" fontSize="sm">
            Clientes que você cadastrou. Toda compra deles (por você ou por eles no portal)
            gera sua comissão VendeMais.
          </Text>
        </Box>
        <Button colorScheme="brand" onClick={abrirNovo}>Novo cliente</Button>
      </Flex>

      <HStack mb={4} maxW="480px">
        <Input
          placeholder="Buscar por nome, CNPJ ou e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && carregar(busca)}
          bg="white"
        />
        <Button onClick={() => carregar(busca)} isLoading={isLoading}>Buscar</Button>
      </HStack>

      {!isLoading && clientes.length === 0 && (
        <Text color="gray.500">Você ainda não cadastrou nenhum cliente.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {clientes.map((c) => (
          <Box key={c.id} borderWidth="1px" borderRadius="md" p={4} bg="white" shadow="sm">
            <Text fontWeight="semibold" noOfLines={1}>{c.nome}</Text>
            {c.cnpj && <Text fontSize="sm" color="gray.600">CNPJ: {c.cnpj}</Text>}
            {c.email && <Text fontSize="sm" color="gray.600" noOfLines={1}>{c.email}</Text>}
            {(c.cidade || c.uf) && (
              <Badge mt={2} colorScheme="blue">{[c.cidade, c.uf].filter(Boolean).join('/')}</Badge>
            )}
            <HStack mt={4}>
              <Button size="sm" onClick={() => abrirEdicao(c)}>Editar</Button>
            </HStack>
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? 'Editar cliente' : 'Novo cliente'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              {!editing && (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>CNPJ</FormLabel>
                    <Input
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>E-mail de acesso</FormLabel>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </FormControl>
                </SimpleGrid>
              )}

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Nome fantasia</FormLabel>
                  <Input
                    value={form.nome_fantasia}
                    onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Razão social</FormLabel>
                  <Input
                    value={form.razao_social}
                    onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Telefone</FormLabel>
                  <Input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </FormControl>
                {!editing && (
                  <FormControl isRequired>
                    <FormLabel>Senha de acesso do cliente</FormLabel>
                    <InputGroup>
                      <Input
                        type={showSenha ? 'text' : 'password'}
                        value={form.senha}
                        onChange={(e) => setForm({ ...form, senha: e.target.value })}
                        placeholder="mínimo 4 caracteres"
                      />
                      <InputRightElement width="4rem">
                        <Button h="1.75rem" size="sm" onClick={() => setShowSenha((v) => !v)}>
                          {showSenha ? 'ocultar' : 'ver'}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                )}
              </SimpleGrid>

              {!editing && (
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <FormControl>
                    <FormLabel>Cidade</FormLabel>
                    <Input
                      value={form.cidade}
                      onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>UF</FormLabel>
                    <Input
                      maxLength={2}
                      value={form.uf}
                      onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                    />
                  </FormControl>
                </SimpleGrid>
              )}

              {!editing && (
                <Text fontSize="xs" color="gray.500">
                  Os demais dados (razão social/endereço) são preenchidos automaticamente pelo
                  CNPJ quando disponível. O cliente poderá logar em cliente.kipi.com.br com o
                  e-mail e a senha acima.
                </Text>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>Cancelar</Button>
            <Button colorScheme="brand" onClick={salvar} isLoading={saving} isDisabled={!podeSalvar}>
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
