import {
  Badge,
  Box,
  Button,
  Checkbox,
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

interface Parceiro {
  id: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  pedido_minimo?: number | null;
  estado_atendimento?: string | null;
  cidades_atendidas: string[];
  participa_venda_mais: boolean;
  vendas_pausadas: boolean;
}

interface ParceiroListResponse {
  items: Parceiro[];
  total: number;
}

interface FormState {
  nome_fantasia: string;
  cnpj: string;
  email: string;
  telefone: string;
  senha: string;
  pedido_minimo: string;
  estado_atendimento: string;
  cidades: string;
  participa_venda_mais: boolean;
  vendas_pausadas: boolean;
}

const emptyForm: FormState = {
  nome_fantasia: '',
  cnpj: '',
  email: '',
  telefone: '',
  senha: '',
  pedido_minimo: '',
  estado_atendimento: '',
  cidades: '',
  participa_venda_mais: true,
  vendas_pausadas: false,
};

export function PartnersPage() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [editing, setEditing] = useState<Parceiro | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const carregar = async (q?: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.get<ParceiroListResponse>('/gestao/parceiros', {
        params: { q: q || undefined, page_size: 100 },
      });
      setParceiros(data.items ?? []);
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar parceiros',
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

  const abrirEdicao = (p: Parceiro) => {
    setEditing(p);
    setForm({
      ...emptyForm,
      nome_fantasia: p.nome_fantasia ?? '',
      cnpj: p.cnpj ?? '',
      email: p.email ?? '',
      telefone: p.telefone ?? '',
      pedido_minimo: p.pedido_minimo != null ? String(p.pedido_minimo) : '',
      estado_atendimento: p.estado_atendimento ?? '',
      cidades: (p.cidades_atendidas ?? []).join(', '),
      participa_venda_mais: p.participa_venda_mais,
      vendas_pausadas: p.vendas_pausadas,
    });
    onOpen();
  };

  const salvar = async () => {
    setSaving(true);
    const cidadesArr = form.cidades
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const pedidoMin = form.pedido_minimo ? Number(form.pedido_minimo.replace(',', '.')) : undefined;
    try {
      if (editing) {
        await api.put(`/gestao/parceiros/${editing.id}`, {
          nome_fantasia: form.nome_fantasia || undefined,
          telefone: form.telefone || undefined,
          pedido_minimo: pedidoMin,
          estado_atendimento: form.estado_atendimento || undefined,
          cidades_atendidas: cidadesArr,
          participa_venda_mais: form.participa_venda_mais,
          vendas_pausadas: form.vendas_pausadas,
        });
        toast({ title: 'Parceiro atualizado', status: 'success' });
      } else {
        await api.post('/gestao/parceiros', {
          nome_fantasia: form.nome_fantasia,
          cnpj: form.cnpj,
          email: form.email,
          telefone: form.telefone || undefined,
          senha: form.senha,
          pedido_minimo: pedidoMin,
          estado_atendimento: form.estado_atendimento || undefined,
          cidades_atendidas: cidadesArr,
          participa_venda_mais: form.participa_venda_mais,
        });
        toast({ title: 'Parceiro cadastrado', status: 'success' });
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
    : form.nome_fantasia.trim() && form.cnpj.trim() && form.email.trim() && form.senha.trim().length >= 4;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
        <Box>
          <Text fontSize="2xl" fontWeight="bold">Meus parceiros</Text>
          <Text color="gray.500" fontSize="sm">
            Parceiros (atacadistas) que você cadastrou. Eles passam a fazer parte da plataforma
            e podem logar em parceiros.kipi.com.br.
          </Text>
        </Box>
        <Button colorScheme="brand" onClick={abrirNovo}>Novo parceiro</Button>
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

      {!isLoading && parceiros.length === 0 && (
        <Text color="gray.500">Você ainda não cadastrou nenhum parceiro.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {parceiros.map((p) => (
          <Box key={p.id} borderWidth="1px" borderRadius="md" p={4} bg="white" shadow="sm">
            <Flex justify="space-between" align="start" gap={2}>
              <Text fontWeight="semibold" noOfLines={1}>{p.nome_fantasia}</Text>
              {p.participa_venda_mais ? (
                <Badge colorScheme="green">VendeMais</Badge>
              ) : (
                <Badge colorScheme="gray">Fora do plano</Badge>
              )}
            </Flex>
            {p.cnpj && <Text fontSize="sm" color="gray.600">CNPJ: {p.cnpj}</Text>}
            {p.email && <Text fontSize="sm" color="gray.600" noOfLines={1}>{p.email}</Text>}
            {p.estado_atendimento && (
              <Text fontSize="sm" color="gray.600">Atende: {p.estado_atendimento}</Text>
            )}
            {p.vendas_pausadas && <Badge mt={2} colorScheme="orange">Vendas pausadas</Badge>}
            <HStack mt={4}>
              <Button size="sm" onClick={() => abrirEdicao(p)}>Editar</Button>
            </HStack>
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? 'Editar parceiro' : 'Novo parceiro'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Nome fantasia</FormLabel>
                <Input
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                />
              </FormControl>

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
                  <FormLabel>Telefone</FormLabel>
                  <Input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </FormControl>
                {!editing && (
                  <FormControl isRequired>
                    <FormLabel>Senha de acesso do parceiro</FormLabel>
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

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Pedido mínimo (R$)</FormLabel>
                  <Input
                    value={form.pedido_minimo}
                    onChange={(e) => setForm({ ...form, pedido_minimo: e.target.value })}
                    placeholder="200"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>UF de atendimento</FormLabel>
                  <Input
                    maxLength={2}
                    value={form.estado_atendimento}
                    onChange={(e) => setForm({ ...form, estado_atendimento: e.target.value.toUpperCase() })}
                  />
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel>Cidades atendidas (separadas por vírgula)</FormLabel>
                <Input
                  value={form.cidades}
                  onChange={(e) => setForm({ ...form, cidades: e.target.value })}
                  placeholder="Porto Alegre, Canoas, Gravataí"
                />
              </FormControl>

              <Checkbox
                isChecked={form.participa_venda_mais}
                onChange={(e) => setForm({ ...form, participa_venda_mais: e.target.checked })}
              >
                Participa do Plano VendeMais (comissão 4,499%)
              </Checkbox>

              {editing && (
                <Checkbox
                  isChecked={form.vendas_pausadas}
                  onChange={(e) => setForm({ ...form, vendas_pausadas: e.target.checked })}
                >
                  Vendas pausadas
                </Checkbox>
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
