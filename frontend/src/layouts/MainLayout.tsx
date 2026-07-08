import { ReactNode } from 'react';
import {
  Avatar,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Image,
  Link as ChakraLink,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spacer,
  Text,
  useColorMode,
  useColorModeValue,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';

import { useAuthStore } from '../store/authStore';

interface NavLinkProps {
  to: string;
  children: ReactNode;
}

function NavLink({ to, children }: NavLinkProps) {
  const location = useLocation();
  const isActive = location.pathname === to;
  const color = useColorModeValue('teal.600', 'teal.200');

  return (
    <ChakraLink
      as={Link}
      to={to}
      px={{ base: 2, md: 3 }}
      py={{ base: 1, md: 2 }}
      rounded="md"
      fontWeight={isActive ? 'bold' : 'medium'}
      color={isActive ? color : undefined}
      fontSize={{ base: 'sm', md: 'md' }}
      whiteSpace="nowrap"
      _hover={{ textDecoration: 'none', bg: useColorModeValue('gray.100', 'gray.700') }}
    >
      {children}
    </ChakraLink>
  );
}

export function MainLayout() {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('gray.50', 'gray.900');
  const headerBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const navigate = useNavigate();
  const { clearSession, user, representanteNomeFantasia, representanteCnpj } = useAuthStore();

  const formatCnpj = (value: string | null | undefined) => {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 14) return value;
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const handleLogout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <Flex direction="column" minH="100vh" bg={bg}>
      <Box
        as="header"
        borderBottomWidth="1px"
        borderColor={borderColor}
        bg={headerBg}
        px={{ base: 3, md: 6 }}
        py={{ base: 2, md: 3 }}
      >
        <Flex
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 2, md: 0 }}
        >
          <HStack order={{ base: 1, md: 1 }} spacing={3}>
            <Image src="/logo.jpeg" alt="KIPI" boxSize={{ base: '28px', md: '32px' }} objectFit="contain" />
            <Box>
              <Heading size={{ base: 'sm', md: 'md' }}>KIPI</Heading>
              <Text
                fontSize={{ base: 'xs', md: 'sm' }}
                color="gray.500"
                display={{ base: 'block', md: 'block' }}
              >
                {representanteNomeFantasia ?? 'Venda Mais'}
              </Text>
              {representanteCnpj && (
                <Text fontSize="xs" color="gray.500">
                  CNPJ: {formatCnpj(representanteCnpj)}
                </Text>
              )}
            </Box>
          </HStack>

          <Spacer display={{ base: 'none', md: 'block' }} />

          <Flex
            order={{ base: 2, md: 3 }}
            w={{ base: 'full', md: 'auto' }}
            justify={{ base: 'flex-end', md: 'flex-end' }}
            align="center"
            gap={{ base: 1, md: 3 }}
            mt={{ base: 0, md: 0 }}
          >
            {user && (
              <Box textAlign="left" display={{ base: 'none', md: 'block' }}>
                <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                  {user.nome}
                </Text>
                <Text
                  fontSize="xs"
                  color="gray.500"
                  noOfLines={1}
                  display={{ base: 'none', md: 'block' }}
                >
                  {user.email}
                </Text>
              </Box>
            )}

            <HStack spacing={2}>
              <Menu>
                <MenuButton
                  as={Button}
                  variant="ghost"
                  size={{ base: 'xs', md: 'sm' }}
                  leftIcon={<Avatar size="xs" name={user?.nome ?? 'Perfil'} />}
                >
                  <Text display={{ base: 'none', md: 'inline' }}>Perfil</Text>
                </MenuButton>
                <MenuList>
                  <MenuItem as={Link} to="/perfil">
                    Meu perfil
                  </MenuItem>
                </MenuList>
              </Menu>
              <IconButton
                aria-label="Alternar tema"
                icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                onClick={toggleColorMode}
                variant="ghost"
                size={{ base: 'xs', md: 'sm' }}
              />
              <Button
                onClick={handleLogout}
                variant="outline"
                size={{ base: 'xs', md: 'sm' }}
              >
                Sair
              </Button>
            </HStack>
          </Flex>

          <Wrap
            order={{ base: 3, md: 2 }}
            spacing={{ base: 2, md: 3 }}
            ml={{ base: 0, md: 10 }}
            as="nav"
            w={{ base: 'full', md: 'auto' }}
            shouldWrapChildren
            py={{ base: 0, md: 0 }}
          >
            <WrapItem>
              <NavLink to="/produtos">Produtos</NavLink>
            </WrapItem>
            <WrapItem>
              <NavLink to="/carrinho">Carrinho</NavLink>
            </WrapItem>
            <WrapItem>
              <NavLink to="/pedidos">Pedidos</NavLink>
            </WrapItem>
            <WrapItem>
              <NavLink to="/dashboard">Dashboard</NavLink>
            </WrapItem>
          </Wrap>
        </Flex>
      </Box>

      <Box as="main" flex="1" px={{ base: 4, md: 6 }} py={{ base: 4, md: 6 }}>
        <Outlet />
      </Box>
    </Flex>
  );
}
