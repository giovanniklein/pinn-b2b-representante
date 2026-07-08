import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Select,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client';

type UnidadeTipo = string;

interface ProdutoPreco {
  unidade: UnidadeTipo;
  preco: number;
  quantidade_unidades: number;
}

interface Produto {
  id: string;
  codigo: string;
  descricao: string;
  image_url?: string | null;
  thumb_url?: string | null;
  imagem_base64?: string | null;
  qtd_minima?: number | null;
  qtd_maxima?: number | null;
  precos?: ProdutoPreco[] | null;
  atacadista_id: string;
  atacadista_nome?: string | null;
}

const formatUnidade = (value: string) => (value ? value.toUpperCase() : value);

const formatCurrency = (value: number | null | undefined) => {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    safeValue,
  );
};

const formatQtdUnidades = (value: number | null | undefined) => {
  const safeValue =
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.trunc(value)
      : 1;
  return `${safeValue} un`;
};

const formatPrecoPorUnidade = (preco: number | null | undefined, quantidadeUnidades: number | null | undefined) => {
  const safePreco = typeof preco === 'number' && Number.isFinite(preco) ? preco : 0;
  const safeQtd =
    typeof quantidadeUnidades === 'number' && Number.isFinite(quantidadeUnidades) && quantidadeUnidades > 0
      ? quantidadeUnidades
      : 1;
  return formatCurrency(safePreco / safeQtd);
};

export function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [produto, setProduto] = useState<Produto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnidadeTipo>('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  const buildImageSrc = (item: Produto) => {
    if (item.image_url) return item.image_url;
    if (item.thumb_url) return item.thumb_url;
    if (item.imagem_base64) return `data:image/png;base64,${item.imagem_base64}`;
    return null;
  };

  useEffect(() => {
    const carregarProduto = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const { data } = await api.get<Produto>(`/produtos/${id}`);
        setProduto(data);
        const firstUnit = Array.isArray(data.precos) ? data.precos[0]?.unidade : '';
        setSelectedUnit(firstUnit ?? '');
        setSelectedQty(data.qtd_minima && data.qtd_minima > 0 ? data.qtd_minima : 1);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ?? 'Nao foi possivel carregar os detalhes do produto.';
        toast({
          title: 'Erro ao carregar produto',
          description: message,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
        navigate('/produtos');
      } finally {
        setIsLoading(false);
      }
    };

    carregarProduto();
  }, [id, navigate, toast]);

  const precoSelecionado = useMemo(() => {
    const precos = Array.isArray(produto?.precos) ? produto?.precos : [];
    return precos.find((preco) => preco.unidade === selectedUnit) ?? null;
  }, [produto?.precos, selectedUnit]);

  const totalEstimado = useMemo(
    () => (precoSelecionado?.preco ?? 0) * selectedQty,
    [precoSelecionado?.preco, selectedQty],
  );

  const handleAddToCart = async () => {
    if (!produto) return;
    if (!selectedUnit) {
      toast({
        title: 'Selecione a unidade',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsAdding(true);
      await api.post('/carrinho/itens', {
        produto_id: produto.id,
        atacadista_id: produto.atacadista_id,
        quantidade: selectedQty,
        unidade_medida: selectedUnit,
      });

      toast({
        title: 'Produto adicionado ao carrinho',
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
      navigate('/produtos');
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? 'Nao foi possivel adicionar ao carrinho.';
      toast({
        title: 'Erro ao adicionar ao carrinho',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return <Text>Carregando produto...</Text>;
  }

  if (!produto) {
    return <Text>Produto nao encontrado.</Text>;
  }

  const precos = Array.isArray(produto.precos) ? produto.precos : [];
  const qtyMin = produto.qtd_minima && produto.qtd_minima > 0 ? produto.qtd_minima : 1;
  const qtyMax = produto.qtd_maxima && produto.qtd_maxima > 0 ? produto.qtd_maxima : 100;
  const temLimites = Boolean(produto.qtd_minima || produto.qtd_maxima);

  return (
    <Box maxW="760px" mx="auto">
      <HStack mb={4} spacing={2}>
        <IconButton
          aria-label="Voltar"
          icon={<ArrowBackIcon />}
          variant="ghost"
          onClick={() => navigate(-1)}
        />
        <Text fontSize="sm" color="gray.500">
          Detalhes do produto
        </Text>
      </HStack>

      <Stack spacing={4}>
        <Box borderWidth="1px" borderRadius="lg" bg="white" overflow="hidden">
          {buildImageSrc(produto) ? (
            <Image
              src={buildImageSrc(produto) ?? undefined}
              alt={produto.descricao}
              objectFit="contain"
              w="100%"
              h={{ base: '280px', md: '380px' }}
              bg="gray.50"
            />
          ) : (
            <Flex align="center" justify="center" h={{ base: '280px', md: '380px' }} bg="gray.50">
              <Text color="gray.400">Sem imagem</Text>
            </Flex>
          )}
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={4} bg="white">
          <Stack spacing={3}>
            <HStack justify="space-between" align="start">
              <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="bold" lineHeight="short">
                {produto.descricao}
              </Text>
              <Badge colorScheme="purple">{produto.codigo}</Badge>
            </HStack>

            <Text fontSize="sm" color="gray.500">
              Atacadista: {produto.atacadista_nome ?? produto.atacadista_id}
            </Text>

            <Box>
              <Text fontSize="xs" color="gray.500" mb={1}>
                Faixas de preco
              </Text>
              <Stack spacing={1}>
                {precos.map((preco) => (
                  <Text key={preco.unidade} fontSize="sm">
                    <strong>
                      {formatUnidade(preco.unidade)} ({formatQtdUnidades(preco.quantidade_unidades)}):
                    </strong>{' '}
                    {formatCurrency(preco.preco)}{' '}
                    <Text as="span" color="gray.500">
                      ({formatPrecoPorUnidade(preco.preco, preco.quantidade_unidades)}/un)
                    </Text>
                  </Text>
                ))}
              </Stack>
            </Box>

            <Text fontSize="3xl" fontWeight="bold">
              {formatCurrency(precoSelecionado?.preco ?? 0)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {selectedUnit ? formatUnidade(selectedUnit) : 'Unidade'} -{' '}
              {formatQtdUnidades(precoSelecionado?.quantidade_unidades)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              Valor por unidade: {formatPrecoPorUnidade(precoSelecionado?.preco, precoSelecionado?.quantidade_unidades)}
            </Text>

            <Stack direction={{ base: 'column', sm: 'row' }} spacing={3}>
              <Box flex="1">
                <Text fontSize="xs" color="gray.500" mb={1}>
                  Unidade de medida
                </Text>
                <Select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value as UnidadeTipo)}
                  isDisabled={precos.length === 0}
                >
                  {precos.map((preco) => (
                    <option key={preco.unidade} value={preco.unidade}>
                      {formatUnidade(preco.unidade)} ({formatQtdUnidades(preco.quantidade_unidades)}) -{' '}
                      {formatPrecoPorUnidade(preco.preco, preco.quantidade_unidades)}/un
                    </option>
                  ))}
                </Select>
              </Box>

              <Box w={{ base: 'full', sm: '140px' }}>
                <Text fontSize="xs" color="gray.500" mb={1}>
                  Quantidade
                  {temLimites && (
                    <Text as="span" color="orange.500">
                      {' '}
                      ({produto.qtd_minima ? `mín ${produto.qtd_minima}` : ''}
                      {produto.qtd_minima && produto.qtd_maxima ? ' / ' : ''}
                      {produto.qtd_maxima ? `máx ${produto.qtd_maxima}` : ''})
                    </Text>
                  )}
                </Text>
                <HStack
                  borderWidth="1px"
                  borderRadius="md"
                  overflow="hidden"
                  spacing={0}
                  h="40px"
                  w={{ base: 'full', sm: '140px' }}
                >
                  <Button
                    variant="ghost"
                    borderRadius="0"
                    h="full"
                    minW="40px"
                    onClick={() => setSelectedQty((prev) => Math.max(prev - 1, qtyMin))}
                  >
                    -
                  </Button>
                  <Flex flex="1" justify="center" align="center" h="full" borderLeftWidth="1px" borderRightWidth="1px">
                    <Text fontWeight="medium">{selectedQty}</Text>
                  </Flex>
                  <Button
                    variant="ghost"
                    borderRadius="0"
                    h="full"
                    minW="40px"
                    onClick={() => setSelectedQty((prev) => Math.min(prev + 1, qtyMax))}
                  >
                    +
                  </Button>
                </HStack>
              </Box>
            </Stack>

            <Box bg="gray.50" borderRadius="md" p={3} borderWidth="1px">
              <Text fontSize="xs" color="gray.500">
                Total estimado
              </Text>
              <Text fontSize="lg" fontWeight="semibold">
                {formatCurrency(totalEstimado)}
              </Text>
            </Box>

            <Button
              colorScheme="green"
              size="lg"
              onClick={handleAddToCart}
              isLoading={isAdding}
              isDisabled={precos.length === 0}
              w="full"
            >
              Adicionar ao carrinho
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
