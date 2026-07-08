import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client';

export type PedidoStatus = 'pendente' | 'aceito' | 'recusado' | 'entregue' | 'cancelado';

interface EnderecoEntrega {
  id: string;
  descricao: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  complemento?: string | null;
  eh_principal?: boolean;
}

interface PedidoListItem {
  id: string;
  atacadista_id: string;
  atacadista_nome?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  cliente_cnpj?: string | null;
  condicao_pagamento?: string;
  observacao_representante?: string | null;
  senha_compra?: string | null;
  valor_total: number;
  status: PedidoStatus;
  data_criacao: string;
  endereco_entrega: EnderecoEntrega;
}

interface PedidoListResponse {
  items: PedidoListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const formatCurrency = (value: number | null | undefined) => {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    safeValue,
  );
};

const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

const formatPedidoCodigo = (id?: string) => {
  if (!id) return 'PED-';
  const suffix = id.slice(-6).toUpperCase();
  return `PED-${suffix}`;
};

function StatusBadge({ status }: { status: PedidoStatus }) {
  const colorScheme =
    status === 'pendente'
      ? 'yellow'
      : status === 'aceito'
        ? 'green'
        : status === 'recusado'
          ? 'red'
          : status === 'cancelado'
            ? 'gray'
            : 'blue';

  const label =
    status === 'pendente'
      ? 'Pendente'
      : status === 'aceito'
        ? 'Aceito'
        : status === 'recusado'
          ? 'Recusado'
          : status === 'cancelado'
            ? 'Cancelado'
            : 'Entregue';

  return (
    <Badge colorScheme={colorScheme} variant="subtle" fontSize="0.75rem">
      {label}
    </Badge>
  );
}

export function OrdersPage() {
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalPedidos, setTotalPedidos] = useState<number>(0);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  const toast = useToast();
  const navigate = useNavigate();

  const carregarPedidos = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get<PedidoListResponse>('/pedidos/', {
        params: {
          page,
          page_size: pageSize,
        },
      });
      setPedidos(data.items ?? []);
      setTotalPages(data.total_pages ?? 1);
      setTotalPedidos(data.total ?? 0);
    } catch (error: any) {
      const message = error?.response?.data?.detail ?? 'Nao foi possivel carregar os pedidos.';
      toast({
        title: 'Erro ao carregar pedidos',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const duplicarPedido = async (pedidoId: string) => {
    try {
      setIsDuplicating(pedidoId);
      await api.post(`/pedidos/${pedidoId}/duplicar`);
      toast({
        title: 'Pedido duplicado',
        description: 'Os itens foram adicionados ao carrinho.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      navigate('/carrinho');
    } catch (error: any) {
      const message = error?.response?.data?.detail ?? 'Nao foi possivel duplicar o pedido.';
      toast({
        title: 'Erro ao duplicar pedido',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsDuplicating(null);
    }
  };

  useEffect(() => {
    carregarPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} mb={4} gap={3}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold">
            Meus pedidos
          </Text>
          <Text fontSize="sm" color="gray.500">
            Acompanhe os pedidos enviados para os atacadistas.
          </Text>
        </Box>
      </Flex>

      <Skeleton isLoaded={!isLoading} borderRadius="md">
        {pedidos.length === 0 ? (
          <Box
            borderWidth="1px"
            borderRadius="md"
            p={8}
            textAlign="center"
            borderStyle="dashed"
            color="gray.500"
          >
            Nenhum pedido encontrado.
          </Box>
        ) : (
          <>
            <Flex justify="space-between" align="center" mb={2} fontSize="sm">
              <Text color="gray.600">
                Exibindo{' '}
                <Text as="span" fontWeight="medium">
                  {pedidos.length}
                </Text>{' '}
                de{' '}
                <Text as="span" fontWeight="medium">
                  {totalPedidos}
                </Text>{' '}
                pedidos
              </Text>
              <Text color="gray.500">
                Pagina{' '}
                <Text as="span" fontWeight="medium">
                  {page}
                </Text>{' '}
                de{' '}
                <Text as="span" fontWeight="medium">
                  {totalPages}
                </Text>
              </Text>
            </Flex>

            <Stack spacing={4} display={{ base: 'flex', md: 'none' }}>
              {pedidos.map((pedido) => (
                <Box key={pedido.id} borderWidth="1px" borderRadius="lg" p={4} bg="white">
                  <HStack justify="space-between" align="start" mb={2}>
                    <Badge colorScheme="purple">
                      {pedido.atacadista_nome ?? pedido.atacadista_id}
                    </Badge>
                    <StatusBadge status={pedido.status} />
                  </HStack>
                  <Text fontWeight="semibold">{formatCurrency(pedido.valor_total)}</Text>
                  <Text fontSize="xs" color="gray.500">
                    Pedido {formatPedidoCodigo(pedido.id)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    {formatDate(pedido.data_criacao)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    Condicao: {pedido.condicao_pagamento ?? 'A VISTA'}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    Cliente: {pedido.cliente_nome || pedido.cliente_cnpj || '-'}
                  </Text>
                  {pedido.senha_compra ? (
                    <Text fontSize="xs" color="purple.600" fontWeight="semibold" mt={1}>
                      Senha: {pedido.senha_compra}
                    </Text>
                  ) : null}
                  {pedido.observacao_representante ? (
                    <Text fontSize="xs" color="gray.500" mt={1} noOfLines={2}>
                      Obs.: {pedido.observacao_representante}
                    </Text>
                  ) : null}
                  <Text fontSize="sm" mt={2} noOfLines={2}>
                    {pedido.endereco_entrega.descricao} - {pedido.endereco_entrega.cidade}/
                    {pedido.endereco_entrega.uf}
                  </Text>
                  <HStack spacing={2} mt={3}>
                    <Button size="xs" variant="outline" onClick={() => navigate(`/pedidos/${pedido.id}`)}>
                      Ver detalhes
                    </Button>
                    <Button
                      size="xs"
                      colorScheme="brand"
                      onClick={() => duplicarPedido(pedido.id)}
                      isLoading={isDuplicating === pedido.id}
                    >
                      Duplicar
                    </Button>
                  </HStack>
                </Box>
              ))}
            </Stack>

            <Table size="sm" variant="simple" display={{ base: 'none', md: 'table' }}>
              <Thead>
                <Tr>
                  <Th>Atacadista</Th>
                  <Th>Cliente</Th>
                  <Th>Endereco de entrega</Th>
                  <Th isNumeric>Valor total</Th>
                  <Th>Status</Th>
                  <Th>Data</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pedidos.map((pedido) => (
                  <Tr
                    key={pedido.id}
                    _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                    onClick={() => navigate(`/pedidos/${pedido.id}`)}
                  >
                    <Td>
                      <HStack spacing={2}>
                        <Badge colorScheme="purple">
                          {pedido.atacadista_nome ?? pedido.atacadista_id}
                        </Badge>
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                          {formatPedidoCodigo(pedido.id)}
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        Condicao: {pedido.condicao_pagamento ?? 'A VISTA'}
                      </Text>
                      {pedido.senha_compra ? (
                        <Text fontSize="xs" color="purple.600" fontWeight="semibold" mt={1}>
                          Senha: {pedido.senha_compra}
                        </Text>
                      ) : null}
                      {pedido.observacao_representante ? (
                        <Text fontSize="xs" color="gray.500" mt={1} noOfLines={2}>
                          Obs.: {pedido.observacao_representante}
                        </Text>
                      ) : null}
                    </Td>
                    <Td>{pedido.cliente_nome || pedido.cliente_cnpj || '-'}</Td>
                    <Td>
                      <Text fontSize="sm" noOfLines={2}>
                        {pedido.endereco_entrega.descricao} - {pedido.endereco_entrega.cidade}/
                        {pedido.endereco_entrega.uf}
                      </Text>
                    </Td>
                    <Td isNumeric>{formatCurrency(pedido.valor_total)}</Td>
                    <Td>
                      <StatusBadge status={pedido.status} />
                    </Td>
                    <Td>{formatDate(pedido.data_criacao)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            <HStack justify="space-between" mt={4} fontSize="sm">
              <Text color="gray.500">
                Pagina{' '}
                <Text as="span" fontWeight="medium">
                  {page}
                </Text>{' '}
                de{' '}
                <Text as="span" fontWeight="medium">
                  {totalPages}
                </Text>
              </Text>
              <HStack spacing={2}>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={page <= 1}
                  onClick={() => setPage((prev: number) => Math.max(prev - 1, 1))}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  colorScheme="brand"
                  variant="solid"
                  isDisabled={page >= totalPages}
                  onClick={() => setPage((prev: number) => Math.min(prev + 1, totalPages))}
                >
                  Proxima
                </Button>
              </HStack>
            </HStack>
          </>
        )}
      </Skeleton>
    </Box>
  );
}
