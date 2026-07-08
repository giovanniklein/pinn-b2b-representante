import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  SimpleGrid,
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
import { useNavigate, useParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { api } from '../api/client';

import type { PedidoStatus } from './OrdersPage';

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
}

interface PedidoItem {
  produto_id: string;
  descricao_produto: string;
  unidade: string;
  quantidade_unidades?: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface PedidoDetailResponse {
  id: string;
  atacadista_id: string;
  atacadista_nome?: string | null;
  condicao_pagamento: string;
  observacao_representante?: string | null;
  senha_compra?: string | null;
  representante_id: string;
  valor_total: number;
  status: PedidoStatus;
  data_criacao: string;
  endereco_entrega: EnderecoEntrega;
  itens: PedidoItem[];
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

export function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<PedidoDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();

  const carregarPedido = async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      const { data } = await api.get<PedidoDetailResponse>(`/pedidos/${id}`);
      setPedido(data);
    } catch (error: any) {
      const message = error?.response?.data?.detail ?? 'Nao foi possivel carregar o pedido.';
      toast({
        title: 'Erro ao carregar pedido',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      navigate('/pedidos');
    } finally {
      setIsLoading(false);
    }
  };

  const duplicarPedido = async () => {
    if (!id) return;
    try {
      setIsDuplicating(true);
      await api.post(`/pedidos/${id}/duplicar`);
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
      setIsDuplicating(false);
    }
  };

  const getPdfFileName = () => `pedido-${formatPedidoCodigo(pedido?.id).toLowerCase()}.pdf`;

  const buildPdfBlob = (): Blob | null => {
    if (!pedido) return null;

    const doc = new jsPDF();
    let currentY = 24;

    doc.setFontSize(16);
    doc.text(`Pedido ${formatPedidoCodigo(pedido.id)}`, 14, 16);
    doc.setFontSize(11);
    doc.text(`Atacadista: ${pedido.atacadista_nome ?? pedido.atacadista_id}`, 14, currentY);
    currentY += 6;
    doc.text(`Status: ${pedido.status}`, 14, currentY);
    currentY += 6;
    doc.text(`Condicao de pagamento: ${pedido.condicao_pagamento ?? 'A VISTA'}`, 14, currentY);
    currentY += 6;
    if (pedido.senha_compra) {
      doc.text(`Senha da compra: ${pedido.senha_compra}`, 14, currentY);
      currentY += 6;
    }
    if (pedido.observacao_representante) {
      const observacaoLines = doc.splitTextToSize(
        `Observacao: ${pedido.observacao_representante}`,
        180,
      );
      doc.text(observacaoLines, 14, currentY);
      currentY += observacaoLines.length * 6;
    }
    doc.text(`Data: ${formatDate(pedido.data_criacao)}`, 14, currentY);
    currentY += 6;
    doc.text(`Valor total: ${formatCurrency(pedido.valor_total)}`, 14, currentY);
    currentY += 10;

    doc.text('Endereco de entrega:', 14, currentY);
    currentY += 6;
    doc.setFontSize(10);
    doc.text(
      `${pedido.endereco_entrega.descricao} - ${pedido.endereco_entrega.logradouro}, ${pedido.endereco_entrega.numero}`,
      14,
      currentY,
    );
    currentY += 6;
    doc.text(
      `${pedido.endereco_entrega.bairro} - ${pedido.endereco_entrega.cidade}/${pedido.endereco_entrega.uf} - CEP ${pedido.endereco_entrega.cep}`,
      14,
      currentY,
    );
    currentY += 6;
    if (pedido.endereco_entrega.complemento) {
      doc.text(`Complemento: ${pedido.endereco_entrega.complemento}`, 14, currentY);
      currentY += 8;
    }

    autoTable(doc, {
      startY: currentY + 2,
      head: [['Produto', 'Unidade', 'Quantidade', 'Valor unitario', 'Subtotal']],
      body: pedido.itens.map((item) => [
        item.descricao_produto,
        item.unidade,
        String(item.quantidade),
        formatCurrency(item.valor_unitario),
        formatCurrency(item.valor_total),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 33, 33] },
    });

    const pdfArrayBuffer = doc.output('arraybuffer');
    return new Blob([pdfArrayBuffer], { type: 'application/pdf' });
  };

  const handleGerarPdf = async () => {
    const blob = buildPdfBlob();
    if (!blob) return;

    try {
      setIsGeneratingPdf(true);
      const fileUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = getPdfFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(fileUrl);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCompartilharPdf = async () => {
    const blob = buildPdfBlob();
    if (!blob || !pedido) return;

    const fileName = getPdfFileName();
    const file = new File([blob], fileName, { type: 'application/pdf' });

    try {
      setIsSharingPdf(true);
      if (
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        'canShare' in navigator &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `Pedido ${formatPedidoCodigo(pedido.id)}`,
          text: `Pedido ${formatPedidoCodigo(pedido.id)} - ${pedido.atacadista_nome ?? pedido.atacadista_id}`,
          files: [file],
        });
        return;
      }

      // Fallback: baixa o PDF quando compartilhamento por arquivo nao for suportado.
      await handleGerarPdf();
      toast({
        title: 'Compartilhamento nao suportado neste dispositivo',
        description: 'PDF baixado para voce compartilhar manualmente.',
        status: 'info',
        duration: 4000,
        isClosable: true,
      });
    } catch {
      toast({
        title: 'Nao foi possivel compartilhar o PDF',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsSharingPdf(false);
    }
  };

  useEffect(() => {
    carregarPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!pedido && !isLoading) {
    return (
      <Box>
        <Text>Pedido nao encontrado.</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} mb={4} gap={3}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold">
            Pedido {formatPedidoCodigo(pedido?.id)}
          </Text>
          <Text fontSize="sm" color="gray.500">
            Detalhes do pedido enviado para o atacadista.
          </Text>
        </Box>
        <Stack direction={{ base: 'column', md: 'row' }} spacing={2} w={{ base: 'full', md: 'auto' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGerarPdf}
            isLoading={isGeneratingPdf}
            w={{ base: 'full', md: 'auto' }}
          >
            Gerar PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCompartilharPdf}
            isLoading={isSharingPdf}
            w={{ base: 'full', md: 'auto' }}
          >
            Compartilhar PDF
          </Button>
          <Button
            size="sm"
            colorScheme="brand"
            onClick={duplicarPedido}
            isLoading={isDuplicating}
            alignSelf={{ base: 'stretch', md: 'center' }}
            w={{ base: 'full', md: 'auto' }}
          >
            Duplicar
          </Button>
        </Stack>
      </Flex>

      <Skeleton isLoaded={!isLoading} borderRadius="md">
        {pedido && (
          <Stack spacing={6}>
            <Box>
              {pedido.senha_compra ? (
                <Box mb={4} p={4} bg="purple.50" borderWidth="1px" borderColor="purple.200" borderRadius="md">
                  <Text fontSize="xs" color="purple.700" fontWeight="semibold" letterSpacing="wide">
                    SENHA DESTA COMPRA
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" letterSpacing="wide" color="purple.700">
                    {pedido.senha_compra}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    Guarde esta senha. Se o fornecedor pedir, informe para confirmar a sua compra.
                  </Text>
                </Box>
              ) : null}
              <Text fontWeight="semibold" mb={2}>
                Informacoes gerais
              </Text>
              <Stack spacing={1} fontSize="sm">
                <HStack justify="space-between">
                  <Text color="gray.600">Atacadista</Text>
                  <Badge colorScheme="purple">
                    {pedido.atacadista_nome ?? pedido.atacadista_id}
                  </Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text color="gray.600">Status</Text>
                  <StatusBadge status={pedido.status} />
                </HStack>
                <HStack justify="space-between">
                  <Text color="gray.600">Valor total</Text>
                  <Text fontWeight="semibold">{formatCurrency(pedido.valor_total)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text color="gray.600">Condicao de pagamento</Text>
                  <Text>{pedido.condicao_pagamento ?? 'A VISTA'}</Text>
                </HStack>
                {pedido.observacao_representante ? (
                  <Box pt={1}>
                    <Text color="gray.600">Observacao enviada</Text>
                    <Text>{pedido.observacao_representante}</Text>
                  </Box>
                ) : null}
                <HStack justify="space-between">
                  <Text color="gray.600">Data de criacao</Text>
                  <Text>{formatDate(pedido.data_criacao)}</Text>
                </HStack>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Text fontWeight="semibold" mb={2}>
                Endereco de entrega
              </Text>
              <Text fontSize="sm">
                {pedido.endereco_entrega.descricao} - {pedido.endereco_entrega.logradouro},{' '}
                {pedido.endereco_entrega.numero} - {pedido.endereco_entrega.bairro} -
                {pedido.endereco_entrega.cidade}/{pedido.endereco_entrega.uf} - CEP{' '}
                {pedido.endereco_entrega.cep}
              </Text>
              {pedido.endereco_entrega.complemento && (
                <Text fontSize="sm" color="gray.600">
                  {pedido.endereco_entrega.complemento}
                </Text>
              )}
            </Box>

            <Divider />

            <Box>
              <Text fontWeight="semibold" mb={2}>
                Itens do pedido
              </Text>

              <Stack spacing={3} display={{ base: 'flex', md: 'none' }}>
                {pedido.itens.map((item) => (
                  <Box key={`${item.produto_id}-${item.unidade}`} borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontWeight="semibold" fontSize="sm">
                      {item.descricao_produto}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      Produto ID: {item.produto_id}
                    </Text>
                    <SimpleGrid columns={2} spacing={2} mt={2} fontSize="sm">
                      <Text color="gray.600">Unidade</Text>
                      <Text textAlign="right">{item.unidade}</Text>
                      <Text color="gray.600">Quantidade</Text>
                      <Text textAlign="right">{item.quantidade}</Text>
                      <Text color="gray.600">Valor unitario</Text>
                      <Text textAlign="right">
                        {formatCurrency(item.valor_unitario)}
                        <Text as="span" color="gray.500">
                          {' '}({formatPrecoPorUnidade(item.valor_unitario, item.quantidade_unidades)}/un)
                        </Text>
                      </Text>
                      <Text color="gray.600">Subtotal</Text>
                      <Text textAlign="right" fontWeight="semibold">
                        {formatCurrency(item.valor_total)}
                      </Text>
                    </SimpleGrid>
                  </Box>
                ))}
              </Stack>

              <Table size="sm" display={{ base: 'none', md: 'table' }}>
                <Thead>
                  <Tr>
                    <Th>Produto</Th>
                    <Th>Unidade</Th>
                    <Th isNumeric>Quantidade</Th>
                    <Th isNumeric>Valor unitario</Th>
                    <Th isNumeric>Subtotal</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pedido.itens.map((item) => (
                    <Tr key={`${item.produto_id}-${item.unidade}`}>
                      <Td>
                        <Text fontSize="sm" fontWeight="semibold">
                          {item.descricao_produto}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          Produto ID: {item.produto_id}
                        </Text>
                      </Td>
                      <Td>{item.unidade}</Td>
                      <Td isNumeric>{item.quantidade}</Td>
                      <Td isNumeric>
                        <Text>{formatCurrency(item.valor_unitario)}</Text>
                        <Text fontSize="xs" color="gray.500">
                          {formatPrecoPorUnidade(item.valor_unitario, item.quantidade_unidades)}/un
                        </Text>
                      </Td>
                      <Td isNumeric>{formatCurrency(item.valor_total)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Stack>
        )}
      </Skeleton>
    </Box>
  );
}
