import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  HStack,
  Input,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
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

import { api } from '../api/client';

const mesAtual = () => new Date().toISOString().slice(0, 7);
const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dataBR = (v: string) => (v ? new Date(v).toLocaleDateString('pt-BR') : '--');
const pct = (v?: number | null) => (v == null ? '--' : `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`);

export function RelatoriosPage() {
  const [mes, setMes] = useState(mesAtual());
  const [rel, setRel] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/relatorios/extrato', { params: { mes } });
      setRel(data);
    } catch (err: any) {
      toast({
        title: 'Falha ao carregar extrato',
        description: err?.response?.data?.detail ?? 'Erro inesperado',
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <Box mb={4}>
        <Text fontSize="2xl" fontWeight="bold">Minhas comissões</Text>
        <Text fontSize="sm" color="gray.500">
          Extrato mensal das suas comissões e como cada venda foi calculada.
        </Text>
      </Box>

      <HStack mb={4}>
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} maxW="200px" bg="white" />
        <Button colorScheme="teal" onClick={() => void carregar()} isLoading={loading}>Gerar</Button>
      </HStack>

      {rel && (
        <>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={4}>
            <Card bg="white" shadow="sm"><CardBody><Stat><StatLabel>Total a receber</StatLabel><StatNumber>{brl(rel.total_comissao)}</StatNumber></Stat></CardBody></Card>
            <Card bg="white" shadow="sm"><CardBody><Stat><StatLabel>Via VendeMais</StatLabel><StatNumber>{brl(rel.total_vendamais)}</StatNumber></Stat></CardBody></Card>
            <Card bg="white" shadow="sm"><CardBody><Stat><StatLabel>Via portal (cliente sozinho)</StatLabel><StatNumber>{brl(rel.total_portal)}</StatNumber></Stat></CardBody></Card>
          </SimpleGrid>

          <Card bg="white" shadow="sm">
            <CardBody overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Data</Th><Th>Cliente</Th><Th>Parceiro</Th><Th>Como foi vendido</Th>
                    <Th isNumeric>Venda</Th><Th isNumeric>%</Th><Th isNumeric>Comissão</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(rel.linhas ?? []).map((l: any, i: number) => (
                    <Tr key={i}>
                      <Td>{dataBR(l.data)}</Td>
                      <Td>{l.cliente}</Td>
                      <Td>{l.parceiro}</Td>
                      <Td>
                        <Badge colorScheme={l.canal?.startsWith('VendeMais') ? 'green' : 'purple'}>
                          {l.canal}
                        </Badge>
                      </Td>
                      <Td isNumeric>{brl(l.valor_total)}</Td>
                      <Td isNumeric>{pct(l.comissao_percentual)}</Td>
                      <Td isNumeric>{brl(l.comissao)}</Td>
                    </Tr>
                  ))}
                  {(rel.linhas ?? []).length === 0 && (
                    <Tr><Td colSpan={7}><Text color="gray.500" fontSize="sm">Sem comissões neste mês.</Text></Td></Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        </>
      )}
    </Box>
  );
}
