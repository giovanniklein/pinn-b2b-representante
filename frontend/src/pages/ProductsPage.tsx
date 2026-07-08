import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Box,
  Flex,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

import { api } from '../api/client';

interface Produto {
  id: string;
  codigo: string;
  descricao: string;
  image_url?: string | null;
  thumb_url?: string | null;
  imagem_base64?: string | null;
  atacadista_id: string;
  atacadista_nome?: string | null;
  precos?: { unidade: string; preco: number; quantidade_unidades: number }[] | null;
}

interface ProdutoListResponse {
  items: Produto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export function ProductsPage() {
  const [items, setItems] = useState<Produto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [vitrineTitulo, setVitrineTitulo] = useState('Aqui frete é grátis');
  const [parceiros, setParceiros] = useState<{ id: string; nome: string }[]>([]);
  const [parceiroId, setParceiroId] = useState('');

  const toast = useToast();
  const navigate = useNavigate();

  const fetchProdutos = async (
    pageToFetch: number,
    term: string,
    append: boolean,
    atacadista: string,
  ) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const { data } = await api.get<ProdutoListResponse>('/produtos', {
        params: {
          page: pageToFetch,
          page_size: 20,
          q: term.trim() ? term.trim() : undefined,
          atacadista_id: atacadista || undefined,
        },
      });

      setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setTotalPages(data.total_pages ?? 1);
      setPage(data.page);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ?? 'Nao foi possivel carregar a lista de produtos.';
      setError(message);
      toast({
        title: 'Erro ao carregar produtos',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    setPage(1);
    setTotalPages(1);
    fetchProdutos(1, searchTerm, false, parceiroId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, parceiroId]);

  useEffect(() => {
    // Título da vitrine é configurável pelo ADM.
    api
      .get<{ vitrine_titulo?: string }>('/configuracoes/')
      .then(({ data }) => {
        if (data?.vitrine_titulo) setVitrineTitulo(data.vitrine_titulo);
      })
      .catch(() => {
        // mantém o título padrão em caso de falha
      });
    // Parceiros que atendem a cidade do cliente (para o seletor de fornecedor).
    api
      .get<{ id: string; nome: string }[]>('/produtos/parceiros')
      .then(({ data }) => setParceiros(Array.isArray(data) ? data : []))
      .catch(() => setParceiros([]));
  }, []);

  useEffect(() => {
    if (page <= 1) return;
    fetchProdutos(page, searchTerm, true, parceiroId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearchTerm(search);
  };

  const hasMore = useMemo(() => page < totalPages, [page, totalPages]);
  const isFiltroAtivo = useMemo(() => searchTerm.trim().length > 0, [searchTerm]);

  const formatCurrency = (value: number | null | undefined) => {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      safeValue,
    );
  };

  const formatUnidade = (value: string) => (value ? value.toUpperCase() : value);

  const formatQtdUnidades = (value: number | null | undefined) => {
    const safeValue =
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
    return `${safeValue} un`;
  };

  const formatPrecoPorUnidade = (preco: number, quantidadeUnidades: number | null | undefined) => {
    const qtd =
      typeof quantidadeUnidades === 'number' && Number.isFinite(quantidadeUnidades) && quantidadeUnidades > 0
        ? quantidadeUnidades
        : 1;
    return formatCurrency(preco / qtd);
  };

  const buildImageSrc = (produto: Produto) => {
    if (produto.thumb_url) return produto.thumb_url;
    if (produto.image_url) return produto.image_url;
    if (produto.imagem_base64) return `data:image/png;base64,${produto.imagem_base64}`;
    return null;
  };

  useEffect(() => {
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first?.isIntersecting &&
          hasMore &&
          !isLoading &&
          !isLoadingMore
        ) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, sentinel]);

  return (
    <Box>
      <Stack spacing={4} mb={4}>
        <Box>
          <Text
            fontSize={{ base: 'lg', sm: 'xl', md: '2xl' }}
            fontWeight="bold"
            lineHeight="short"
            noOfLines={1}
          >
            {vitrineTitulo}
          </Text>
          <Text color="gray.500" fontSize="sm">
            Toque na foto para abrir os detalhes e comprar.
          </Text>
        </Box>
      </Stack>

      <Box
        position="sticky"
        top={{ base: '0', md: '12px' }}
        zIndex={30}
        bg="gray.50"
        pt={1}
        pb={3}
        mb={4}
      >
        <Stack spacing={2}>
          <Box as="form" onSubmit={handleSearchSubmit}>
            <InputGroup size="md">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Buscar por nome ou descricao do produto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                bg="white"
              />
            </InputGroup>
          </Box>

          <Select
            size="md"
            bg="white"
            value={parceiroId}
            onChange={(e) => setParceiroId(e.target.value)}
            aria-label="Escolher fornecedor"
          >
            <option value="">Todos os fornecedores</option>
            {parceiros.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.nome || 'FORNECEDOR').toUpperCase()}
              </option>
            ))}
          </Select>
          {parceiroId && (
            <Text fontSize="xs" color="gray.500">
              Mostrando apenas produtos deste fornecedor. Seu pedido sairá só com ele.
            </Text>
          )}
        </Stack>
      </Box>

      {isLoading && (
        <Flex align="center" gap={2} mb={4}>
          <Spinner size="sm" />
          <Text>Carregando produtos...</Text>
        </Flex>
      )}

      {error && !isLoading && (
        <Text color="red.500" mb={4}>
          {error}
        </Text>
      )}

      {items.length === 0 && !isLoading && <Text>Nenhum produto encontrado.</Text>}

      {items.length > 0 && (
        <>
          <SimpleGrid
            columns={isFiltroAtivo ? { base: 1, md: 2 } : { base: 2, sm: 2, md: 3, lg: 4 }}
            spacing={{ base: 3, md: 4 }}
          >
            {items.map((produto) => (
              <Box
                key={produto.id}
                role="button"
                borderRadius="lg"
                overflow="hidden"
                bg="white"
                borderWidth="1px"
                shadow="sm"
                onClick={() => navigate(`/produtos/${produto.id}`)}
                _hover={{ transform: 'translateY(-2px)', shadow: 'md' }}
                transition="all 0.15s ease"
              >
                {buildImageSrc(produto) ? (
                  <Image
                    src={buildImageSrc(produto) ?? undefined}
                    alt={produto.descricao}
                    w="100%"
                    h={{ base: '150px', sm: '170px', md: '220px' }}
                    objectFit="contain"
                    bg="gray.50"
                  />
                ) : (
                  <Flex
                    w="100%"
                    h={{ base: '150px', sm: '170px', md: '220px' }}
                    align="center"
                    justify="center"
                    bg="gray.100"
                  >
                    <Text fontSize="xs" color="gray.500" textAlign="center" px={2}>
                      Sem imagem
                    </Text>
                  </Flex>
                )}

                <Box p={3}>
                  <Text fontSize="sm" fontWeight="semibold" noOfLines={2} mb={isFiltroAtivo ? 2 : 0}>
                    {produto.descricao}
                  </Text>

                  {isFiltroAtivo && (
                    <>
                      <Text fontSize="xs" color="gray.500" mb={2} noOfLines={1}>
                        Fornecedor: {produto.atacadista_nome ?? produto.atacadista_id}
                      </Text>

                      <Stack spacing={1}>
                        {(Array.isArray(produto.precos) ? produto.precos : []).map((preco) => (
                          <Text key={preco.unidade} fontSize="xs" color="gray.700">
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
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </SimpleGrid>

          <Box ref={setSentinel} h="1px" />
          {isLoadingMore && (
            <Flex mt={4} align="center" justify="center" gap={2}>
              <Spinner size="sm" />
              <Text fontSize="sm" color="gray.600">
                Carregando mais produtos...
              </Text>
            </Flex>
          )}
          {!hasMore && !isLoading && !isLoadingMore && (
            <Text mt={4} textAlign="center" fontSize="sm" color="gray.500">
              Voce chegou ao fim da lista.
            </Text>
          )}
        </>
      )}
    </Box>
  );
}
