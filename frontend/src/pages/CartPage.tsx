import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';

interface CarrinhoItem {
  produto_id: string;
  descricao_produto?: string | null;
  atacadista_id: string;
  atacadista_nome?: string | null;
  quantidade: number;
  unidade_medida: string;
  preco_unitario: number;
  subtotal: number;
  qtd_minima?: number | null;
  qtd_maxima?: number | null;
  precos: { unidade: string; preco: number; quantidade_unidades: number }[];
}

const getQtyMinItem = (item: CarrinhoItem) =>
  item.qtd_minima && item.qtd_minima > 0 ? item.qtd_minima : 1;

const getQtyMaxItem = (item: CarrinhoItem) =>
  item.qtd_maxima && item.qtd_maxima > 0 ? item.qtd_maxima : 100;

interface CarrinhoResponse {
  itens: CarrinhoItem[];
  condicoes_pagamento_por_atacadista?: Record<string, string[]>;
  valor_total: number;
  atualizado_em: string | null;
}

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

interface FinalizarCarrinhoResponse {
  pedidos_gerados: {
    pedido_id: string;
    atacadista_id: string;
    valor_total: number;
  }[];
}

interface ProdutoComplementar {
  id: string;
  descricao: string;
  atacadista_id: string;
  precos?: { unidade: string; preco: number; quantidade_unidades: number }[] | null;
}

interface ProdutoComplementarListResponse {
  items: ProdutoComplementar[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface MinimoNaoAtingidoDetail {
  code: 'MIN_ORDER_NOT_REACHED';
  atacadista_id: string;
  atacadista_nome: string;
  valor_total_atual: number;
  pedido_minimo: number;
  faltante: number;
  message: string;
}

const formatCurrency = (value: number | null | undefined) => {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    safeValue,
  );
};

const formatUnidade = (value: string) => (value ? value.toUpperCase() : value);

const formatQtdUnidades = (value: number | null | undefined) => {
  const safeValue =
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.trunc(value)
      : 1;
  return `${safeValue} un`;
};

const formatPrecoPorUnidade = (
  preco: number | null | undefined,
  quantidadeUnidades: number | null | undefined,
) => {
  const safePreco = typeof preco === 'number' && Number.isFinite(preco) ? preco : 0;
  const safeQtd =
    typeof quantidadeUnidades === 'number' && Number.isFinite(quantidadeUnidades) && quantidadeUnidades > 0
      ? quantidadeUnidades
      : 1;
  return formatCurrency(safePreco / safeQtd);
};

export function CartPage() {
  const [carrinho, setCarrinho] = useState<CarrinhoResponse | null>(null);
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [condicoesPagamentoSelecionadas, setCondicoesPagamentoSelecionadas] = useState<
    Record<string, string>
  >({});
  const [enderecosSelecionados, setEnderecosSelecionados] = useState<
    Record<string, string>
  >({});
  const [observacoesPorAtacadista, setObservacoesPorAtacadista] = useState<
    Record<string, string>
  >({});
  const [isFinalizando, setIsFinalizando] = useState(false);
  const [minimoDetail, setMinimoDetail] = useState<MinimoNaoAtingidoDetail | null>(null);
  const [produtosComplementares, setProdutosComplementares] = useState<ProdutoComplementar[]>([]);
  const [isLoadingComplementares, setIsLoadingComplementares] = useState(false);
  const [selectedUnitById, setSelectedUnitById] = useState<Record<string, string>>({});
  const [selectedQtyById, setSelectedQtyById] = useState<Record<string, number>>({});
  const [isAddingComplementar, setIsAddingComplementar] = useState<string | null>(null);
  const [buscaComplementar, setBuscaComplementar] = useState('');
  const pendingUpdateTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const loadCarrinho = async () => {
    try {
      const { data } = await api.get<CarrinhoResponse>('/carrinho/');
      setCarrinho(data);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Nao foi possivel carregar o carrinho.';
      toast({
        title: 'Erro ao carregar carrinho',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const loadEnderecos = async () => {
    try {
      const { data } = await api.get<EnderecoListResponse>('/enderecos/');
      setEnderecos(data.items);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Nao foi possivel carregar os enderecos.';
      toast({
        title: 'Erro ao carregar enderecos',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    loadCarrinho();
    loadEnderecos();
  }, []);

  const itensAgrupadosPorAtacadista = useMemo(() => {
    const grupos: Record<string, CarrinhoItem[]> = {};
    if (!carrinho?.itens) return grupos;

    for (const item of carrinho.itens) {
      if (!grupos[item.atacadista_id]) {
        grupos[item.atacadista_id] = [];
      }
      grupos[item.atacadista_id].push(item);
    }
    return grupos;
  }, [carrinho]);

  const subtotalPorAtacadista = useMemo(() => {
    const mapa: Record<string, number> = {};
    Object.entries(itensAgrupadosPorAtacadista).forEach(([atacadistaId, itens]) => {
      mapa[atacadistaId] = itens.reduce((acc, item) => acc + item.subtotal, 0);
    });
    return mapa;
  }, [itensAgrupadosPorAtacadista]);

  const handleAlterarItem = async (
    produtoId: string,
    quantidade: number,
    unidade_medida: CarrinhoItem['unidade_medida'],
  ) => {
    try {
      const { data } = await api.put<CarrinhoResponse>(
        `/carrinho/itens/${produtoId}`,
        {
          quantidade,
          unidade_medida,
        },
      );
      setCarrinho(data);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Nao foi possivel atualizar o item do carrinho.';
      toast({
        title: 'Erro ao atualizar item',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleRemoverItem = async (produtoId: string) => {
    try {
      const { data } = await api.delete<CarrinhoResponse>(`/carrinho/itens/${produtoId}`);
      setCarrinho(data);
      toast({
        title: 'Item removido do carrinho',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Nao foi possivel remover o item do carrinho.';
      toast({
        title: 'Erro ao remover item',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleSelecionarEndereco = (atacadistaId: string, enderecoId: string) => {
    setEnderecosSelecionados((prev) => ({
      ...prev,
      [atacadistaId]: enderecoId,
    }));
  };

  const scheduleAlterarItem = (
    produtoId: string,
    quantidade: number,
    unidade_medida: CarrinhoItem['unidade_medida'],
  ) => {
    const key = `${produtoId}:${unidade_medida}`;
    const existing = pendingUpdateTimers.current[key];
    if (existing) {
      clearTimeout(existing);
    }
    pendingUpdateTimers.current[key] = setTimeout(() => {
      void handleAlterarItem(produtoId, quantidade, unidade_medida);
      delete pendingUpdateTimers.current[key];
    }, 250);
  };

  useEffect(
    () => () => {
      Object.values(pendingUpdateTimers.current).forEach((timer) => clearTimeout(timer));
      pendingUpdateTimers.current = {};
    },
    [],
  );

  const handleSelecionarCondicaoPagamento = (atacadistaId: string, condicao: string) => {
    setCondicoesPagamentoSelecionadas((prev) => ({
      ...prev,
      [atacadistaId]: condicao,
    }));
  };

  const handleAlterarObservacao = (atacadistaId: string, observacao: string) => {
    setObservacoesPorAtacadista((prev) => ({
      ...prev,
      [atacadistaId]: observacao,
    }));
  };

  const getEnderecoPadraoId = () => {
    if (!enderecos.length) return null;
    const principal = enderecos.find((endereco) => endereco.eh_principal);
    return principal?.id ?? enderecos[0].id;
  };

  useEffect(() => {
    if (!enderecos.length) return;
    const enderecoPadraoId = getEnderecoPadraoId();
    if (!enderecoPadraoId) return;

    const atacadistas = Object.keys(itensAgrupadosPorAtacadista);
    if (!atacadistas.length) return;

    setEnderecosSelecionados((prev) => {
      const next = { ...prev };
      for (const atacadistaId of atacadistas) {
        const current = next[atacadistaId];
        const exists = enderecos.some((endereco) => endereco.id === current);
        if (!current || !exists) {
          next[atacadistaId] = enderecoPadraoId;
        }
      }
      return next;
    });
  }, [enderecos, itensAgrupadosPorAtacadista]);

  useEffect(() => {
    if (!carrinho?.condicoes_pagamento_por_atacadista) return;

    const atacadistas = Object.keys(itensAgrupadosPorAtacadista);
    if (!atacadistas.length) return;

    setCondicoesPagamentoSelecionadas((prev) => {
      const next = { ...prev };
      for (const atacadistaId of atacadistas) {
        const opcoes = carrinho.condicoes_pagamento_por_atacadista?.[atacadistaId] ?? ['A VISTA'];
        const condicaoDefault = opcoes.find((item) => item === 'A VISTA') ?? opcoes[0] ?? 'A VISTA';
        const atual = next[atacadistaId];
        if (!atual || !opcoes.includes(atual)) {
          next[atacadistaId] = condicaoDefault;
        }
      }
      return next;
    });
  }, [carrinho?.condicoes_pagamento_por_atacadista, itensAgrupadosPorAtacadista]);

  const carregarProdutosComplementares = async (atacadistaId: string, termo?: string) => {
    try {
      setIsLoadingComplementares(true);
      const { data } = await api.get<ProdutoComplementarListResponse>('/produtos/', {
        params: {
          atacadista_id: atacadistaId,
          page: 1,
          page_size: 20,
          q: termo && termo.trim() ? termo.trim() : undefined,
        },
      });

      const items = data.items ?? [];
      setProdutosComplementares(items);

      setSelectedUnitById((prev) => {
        const next = { ...prev };
        for (const produto of items) {
          const firstUnit = Array.isArray(produto.precos) ? produto.precos[0]?.unidade : '';
          if (firstUnit && !next[produto.id]) {
            next[produto.id] = firstUnit;
          }
        }
        return next;
      });
      setSelectedQtyById((prev) => {
        const next = { ...prev };
        for (const produto of items) {
          if (!next[produto.id]) {
            next[produto.id] = 1;
          }
        }
        return next;
      });
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? 'Nao foi possivel carregar produtos sugeridos.';
      toast({
        title: 'Erro ao carregar sugestoes',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsLoadingComplementares(false);
    }
  };

  const abrirComplementoPedidoMinimo = async (detail: MinimoNaoAtingidoDetail) => {
    setMinimoDetail(detail);
    setBuscaComplementar('');
    onOpen();
    await carregarProdutosComplementares(detail.atacadista_id);
  };

  const buscarComplementares = async () => {
    if (!minimoDetail) return;
    await carregarProdutosComplementares(minimoDetail.atacadista_id, buscaComplementar);
  };

  const adicionarProdutoComplementar = async (produto: ProdutoComplementar) => {
    const precos = Array.isArray(produto.precos) ? produto.precos : [];
    const unidade = selectedUnitById[produto.id] ?? precos[0]?.unidade ?? null;
    const quantidade = selectedQtyById[produto.id] ?? 1;
    if (!unidade) {
      toast({
        title: 'Produto sem unidade disponivel',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsAddingComplementar(produto.id);
      await api.post('/carrinho/itens', {
        produto_id: produto.id,
        atacadista_id: produto.atacadista_id,
        quantidade,
        unidade_medida: unidade,
      });
      await loadCarrinho();
      toast({
        title: 'Produto adicionado ao carrinho',
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? 'Nao foi possivel adicionar o produto.';
      toast({
        title: 'Erro ao adicionar produto',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsAddingComplementar(null);
    }
  };

  const handleFinalizar = async () => {
    if (!carrinho || !carrinho.itens.length) {
      toast({
        title: 'Carrinho vazio',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!enderecos.length) {
      toast({
        title: 'Cadastre um endereco',
        description: 'Cadastre ao menos um endereco de entrega para finalizar o pedido.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    const atacadistas = Object.keys(itensAgrupadosPorAtacadista);
    const enderecoPadraoId = getEnderecoPadraoId();
    const enderecosPayload = atacadistas.map((atacadistaId) => ({
      atacadista_id: atacadistaId,
      endereco_id: enderecosSelecionados[atacadistaId] ?? enderecoPadraoId ?? '',
      condicao_pagamento: condicoesPagamentoSelecionadas[atacadistaId] ?? 'A VISTA',
      observacao: observacoesPorAtacadista[atacadistaId]?.trim() ?? '',
    }));

    const payload = {
      enderecos: enderecosPayload,
    };

    try {
      setIsFinalizando(true);
      const { data } = await api.post<FinalizarCarrinhoResponse>(
        '/carrinho/finalizar',
        payload,
      );

      toast({
        title: 'Pedidos gerados com sucesso',
        description: `${data.pedidos_gerados.length} pedido(s) foram criados.`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      // Apos finalizar, recarrega carrinho
      await loadCarrinho();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'MIN_ORDER_NOT_REACHED') {
        await abrirComplementoPedidoMinimo(detail as MinimoNaoAtingidoDetail);
        return;
      }

      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message ?? 'Nao foi possivel finalizar o carrinho.';
      toast({
        title: 'Erro ao finalizar carrinho',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsFinalizando(false);
    }
  };

  const getQtdUnidadesItem = (item: CarrinhoItem) => {
    const opt = item.precos.find((preco) => preco.unidade === item.unidade_medida);
    return opt?.quantidade_unidades ?? 1;
  };

  if (!carrinho || carrinho.itens.length === 0) {
    return (
      <Box>
        <Text fontSize="2xl" fontWeight="bold" mb={2}>
          Meu carrinho
        </Text>
        <Text color="gray.500">Seu carrinho esta vazio no momento.</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="2xl" fontWeight="bold" mb={2}>
        Meu carrinho
      </Text>
      <Text color="gray.500" mb={6}>
        Revise os itens e selecione um endereco de entrega para cada atacadista antes de
        finalizar.
      </Text>

      <Stack spacing={6}>
        {Object.entries(itensAgrupadosPorAtacadista).map(([atacadistaId, itens]) => (
          <Box key={atacadistaId} borderWidth="1px" borderRadius="md" p={4} bg="white">
            <Flex
              justify="space-between"
              align={{ base: 'stretch', md: 'center' }}
              direction={{ base: 'column', md: 'row' }}
              mb={3}
              gap={{ base: 3, md: 0 }}
            >
              <HStack spacing={3}>
                <Text fontWeight="semibold">Atacadista</Text>
                <Badge colorScheme="purple">
                  {itens[0]?.atacadista_nome ?? atacadistaId}
                </Badge>
              </HStack>

              <Stack
                spacing={2}
                direction={{ base: 'column', sm: 'row' }}
                align={{ base: 'stretch', sm: 'center' }}
                w={{ base: 'full', md: 'auto' }}
              >
                <Text fontSize="sm" color="gray.600">
                  Condicao de pagamento
                </Text>
                <Select
                  size="sm"
                  value={condicoesPagamentoSelecionadas[atacadistaId] ?? 'A VISTA'}
                  onChange={(e) =>
                    handleSelecionarCondicaoPagamento(atacadistaId, e.target.value)
                  }
                  w={{ base: 'full', md: '220px' }}
                  maxW={{ base: 'full', md: '220px' }}
                >
                  {(carrinho?.condicoes_pagamento_por_atacadista?.[atacadistaId] ?? ['A VISTA']).map(
                    (condicao) => (
                      <option key={condicao} value={condicao}>
                        {condicao}
                      </option>
                    ),
                  )}
                </Select>

                <Text fontSize="sm" color="gray.600">
                  Endereco de entrega
                </Text>
                <Select
                  size="sm"
                  value={enderecosSelecionados[atacadistaId] ?? ''}
                  onChange={(e) => handleSelecionarEndereco(atacadistaId, e.target.value)}
                  w={{ base: 'full', md: '320px' }}
                  maxW={{ base: 'full', md: '320px' }}
                  isDisabled={enderecos.length <= 1}
                >
                  {enderecos.map((endereco) => (
                    <option key={endereco.id} value={endereco.id}>
                      {endereco.descricao} - {endereco.cidade}/{endereco.uf}
                    </option>
                  ))}
                </Select>
              </Stack>
            </Flex>

            <Stack spacing={3} display={{ base: 'flex', md: 'none' }}>
              {itens.map((item) => (
                <Box
                  key={`${item.produto_id}-${item.unidade_medida}`}
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                  bg="gray.50"
                >
                  <Text fontWeight="medium">
                    {item.descricao_produto || 'Produto sem descricao'}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    ID: {item.produto_id}
                  </Text>

                  <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={3} mt={3}>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        Unidade
                      </Text>
                      <Select
                        size="sm"
                        value={item.unidade_medida}
                        onChange={(e) =>
                          handleAlterarItem(
                            item.produto_id,
                            item.quantidade,
                            e.target.value as CarrinhoItem['unidade_medida'],
                          )
                        }
                      >
                        {item.precos.map((preco) => (
                          <option key={preco.unidade} value={preco.unidade}>
                            {formatUnidade(preco.unidade)} ({formatQtdUnidades(preco.quantidade_unidades)}) -{' '}
                            {formatPrecoPorUnidade(preco.preco, preco.quantidade_unidades)}/un
                          </option>
                        ))}
                      </Select>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        Quantidade
                        {(item.qtd_minima || item.qtd_maxima) && (
                          <Text as="span" color="orange.500">
                            {' '}
                            ({item.qtd_minima ? `mín ${item.qtd_minima}` : ''}
                            {item.qtd_minima && item.qtd_maxima ? '/' : ''}
                            {item.qtd_maxima ? `máx ${item.qtd_maxima}` : ''})
                          </Text>
                        )}
                      </Text>
                      <NumberInput
                        size="sm"
                        min={getQtyMinItem(item)}
                        max={getQtyMaxItem(item)}
                        value={item.quantidade}
                        onChange={(_, valueAsNumber) =>
                          scheduleAlterarItem(
                            item.produto_id,
                            Number.isFinite(valueAsNumber) ? valueAsNumber : getQtyMinItem(item),
                            item.unidade_medida,
                          )
                        }
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        Preco
                      </Text>
                      <Text fontWeight="semibold">{formatCurrency(item.preco_unitario)}</Text>
                      <Text fontSize="xs" color="gray.500">
                        {formatPrecoPorUnidade(item.preco_unitario, getQtdUnidadesItem(item))}/un
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        Subtotal
                      </Text>
                      <Text fontWeight="semibold">{formatCurrency(item.subtotal)}</Text>
                    </Box>
                  </SimpleGrid>

                  <Button
                    size="xs"
                    variant="outline"
                    colorScheme="red"
                    mt={3}
                    onClick={() => handleRemoverItem(item.produto_id)}
                  >
                    Remover
                  </Button>
                </Box>
              ))}
            </Stack>

            <Table size="sm" display={{ base: 'none', md: 'table' }}>
              <Thead>
                <Tr>
                  <Th>Produto</Th>
                  <Th>Unidade</Th>
                  <Th isNumeric>Quantidade</Th>
                  <Th isNumeric>Preco unitario</Th>
                  <Th isNumeric>Subtotal</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {itens.map((item) => (
                  <Tr key={`${item.produto_id}-${item.unidade_medida}`}>
                    <Td>
                      <Text fontWeight="medium">
                        {item.descricao_produto || 'Produto sem descricao'}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        ID: {item.produto_id}
                      </Text>
                    </Td>
                    <Td>
                      <Select
                        size="sm"
                        value={item.unidade_medida}
                        onChange={(e) =>
                          handleAlterarItem(
                            item.produto_id,
                            item.quantidade,
                            e.target.value as CarrinhoItem['unidade_medida'],
                          )
                        }
                      >
                        {item.precos.map((preco) => (
                          <option key={preco.unidade} value={preco.unidade}>
                            {formatUnidade(preco.unidade)} ({formatQtdUnidades(preco.quantidade_unidades)}) -{' '}
                            {formatPrecoPorUnidade(preco.preco, preco.quantidade_unidades)}/un
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td isNumeric>
                      <NumberInput
                        size="sm"
                        min={getQtyMinItem(item)}
                        max={getQtyMaxItem(item)}
                        value={item.quantidade}
                        onChange={(_, valueAsNumber) =>
                          scheduleAlterarItem(
                            item.produto_id,
                            Number.isFinite(valueAsNumber) ? valueAsNumber : getQtyMinItem(item),
                            item.unidade_medida,
                          )
                        }
                        maxW="100px"
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                      {(item.qtd_minima || item.qtd_maxima) && (
                        <Text fontSize="xs" color="orange.500">
                          {item.qtd_minima ? `mín ${item.qtd_minima}` : ''}
                          {item.qtd_minima && item.qtd_maxima ? ' / ' : ''}
                          {item.qtd_maxima ? `máx ${item.qtd_maxima}` : ''}
                        </Text>
                      )}
                    </Td>
                    <Td isNumeric>
                      <Text>{formatCurrency(item.preco_unitario)}</Text>
                      <Text fontSize="xs" color="gray.500">
                        {formatPrecoPorUnidade(item.preco_unitario, getQtdUnidadesItem(item))}/un
                      </Text>
                    </Td>
                    <Td isNumeric>{formatCurrency(item.subtotal)}</Td>
                    <Td isNumeric>
                      <Button
                        size="xs"
                        variant="outline"
                        colorScheme="red"
                        onClick={() => handleRemoverItem(item.produto_id)}
                      >
                        Remover
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            <Divider my={3} />

            <Flex
              justify="space-between"
              align={{ base: 'flex-start', md: 'center' }}
              direction={{ base: 'column', md: 'row' }}
              gap={{ base: 1, md: 0 }}
            >
              <Text fontSize="sm" color="gray.600">
                Subtotal do atacadista
              </Text>
              <Text fontWeight="semibold">
                {formatCurrency(subtotalPorAtacadista[atacadistaId] ?? 0)}
              </Text>
            </Flex>

            <Box mt={4}>
              <Text fontSize="sm" color="gray.600" mb={2}>
                Observacao para o atacadista
              </Text>
              <Textarea
                size="sm"
                rows={3}
                placeholder="Escreva uma observacao opcional sobre este pedido"
                value={observacoesPorAtacadista[atacadistaId] ?? ''}
                onChange={(e) => handleAlterarObservacao(atacadistaId, e.target.value)}
              />
            </Box>
          </Box>
        ))}

        <Box textAlign={{ base: 'left', md: 'right' }}>
          <Text fontSize="sm" color="gray.600">
            Valor total do carrinho
          </Text>
          <Text fontSize="2xl" fontWeight="bold">
            {formatCurrency(carrinho.valor_total)}
          </Text>

          <Button
            mt={4}
            colorScheme="brand"
            onClick={handleFinalizar}
            isLoading={isFinalizando}
            w={{ base: 'full', md: 'auto' }}
          >
            Finalizar pedido
          </Button>
        </Box>
      </Stack>

      <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Complete o pedido minimo</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {minimoDetail && (
              <Box mb={4}>
                <Text fontSize="sm" color="gray.600">
                  Fornecedor
                </Text>
                <Text fontWeight="semibold">{minimoDetail.atacadista_nome}</Text>
                <Text fontSize="sm" color="gray.600" mt={2}>
                  Atual: {formatCurrency(minimoDetail.valor_total_atual)} | Minimo:{' '}
                  {formatCurrency(minimoDetail.pedido_minimo)}
                </Text>
                <Text fontSize="sm" color="orange.500" fontWeight="medium">
                  Faltam {formatCurrency(minimoDetail.faltante)} para fechar.
                </Text>
              </Box>
            )}

            <Box as="form" mb={4} onSubmit={(e) => { e.preventDefault(); void buscarComplementares(); }}>
              <InputGroup size="lg">
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Buscar por nome ou descricao do produto"
                  value={buscaComplementar}
                  onChange={(e) => setBuscaComplementar(e.target.value)}
                  bg="white"
                />
              </InputGroup>
              <Text fontSize="xs" color="gray.500" mt={1}>
                Busque mais itens deste fornecedor para completar o pedido minimo.
              </Text>
            </Box>

            {isLoadingComplementares ? (
              <Text>Carregando produtos...</Text>
            ) : produtosComplementares.length === 0 ? (
              <Text color="gray.500">Nao encontramos produtos desse fornecedor.</Text>
            ) : (
              <Stack spacing={3}>
                {produtosComplementares.map((produto) => (
                  <Box key={produto.id} borderWidth="1px" borderRadius="md" p={4}>
                    <Text fontWeight="semibold" fontSize="md" mb={3}>
                      {produto.descricao}
                    </Text>
                    <Stack
                      direction={{ base: 'column', md: 'row' }}
                      spacing={3}
                      align={{ base: 'stretch', md: 'flex-end' }}
                    >
                      <Box flex="1">
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Embalagem
                        </Text>
                        <Select
                          size="lg"
                          value={selectedUnitById[produto.id] ?? ''}
                          onChange={(e) =>
                            setSelectedUnitById((prev) => ({
                              ...prev,
                              [produto.id]: e.target.value,
                            }))
                          }
                        >
                          {(produto.precos ?? []).map((preco) => (
                            <option key={preco.unidade} value={preco.unidade}>
                              {formatUnidade(preco.unidade)} ({formatQtdUnidades(preco.quantidade_unidades)}) -{' '}
                              {formatCurrency(preco.preco)} ({formatPrecoPorUnidade(preco.preco, preco.quantidade_unidades)}/un)
                            </option>
                          ))}
                        </Select>
                      </Box>

                      <Box w={{ base: 'full', md: '140px' }}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Quantidade
                        </Text>
                        <NumberInput
                          size="lg"
                          min={1}
                          max={100}
                          value={selectedQtyById[produto.id] ?? 1}
                          onChange={(_, valueAsNumber) =>
                            setSelectedQtyById((prev) => ({
                              ...prev,
                              [produto.id]: Number.isFinite(valueAsNumber) ? valueAsNumber : 1,
                            }))
                          }
                        >
                          <NumberInputField textAlign="center" fontSize="lg" />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </Box>

                      <Button
                        size="lg"
                        colorScheme="brand"
                        onClick={() => adicionarProdutoComplementar(produto)}
                        isLoading={isAddingComplementar === produto.id}
                        w={{ base: 'full', md: 'auto' }}
                      >
                        Adicionar
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

