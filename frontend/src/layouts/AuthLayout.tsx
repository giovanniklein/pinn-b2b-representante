import { Box, Container, Flex, Heading, Image, Text, useColorModeValue } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  const bg = useColorModeValue('gray.50', 'gray.900');

  return (
    <Flex minH="100vh" bg={bg} align="center" justify="center" px={4}>
      <Container maxW="lg">
        <Box textAlign="center" mb={8}>
          <Image
            src="/logo.jpeg"
            alt="KIPI"
            boxSize="72px"
            mx="auto"
            mb={3}
            objectFit="contain"
          />
          <Heading size="lg" mb={1}>
            KIPI
          </Heading>
          <Text fontWeight="semibold" color="gray.600" mb={2}>KIPI - Representante</Text>
          <Text color="gray.500">VendeMais - portal do representante comercial KIPI.</Text>
        </Box>
        <Outlet />
      </Container>
    </Flex>
  );
}
