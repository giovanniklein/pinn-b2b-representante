import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FormEvent, useState } from 'react';

import { useAuthStore } from '../store/authStore';
import { AddressesPage } from './AddressesPage';

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ProfilePage() {
  const { user, representanteNomeFantasia, representanteRazaoSocial } = useAuthStore();
  const toast = useToast();
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handlePasswordChange = (field: keyof PasswordFormState, value: string) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast({
      title: 'Funcionalidade em breve',
      description: 'Atualizacao de senha ainda nao esta disponivel neste portal.',
      status: 'info',
      duration: 4000,
      isClosable: true,
    });
  };

  return (
    <Box>
      <Text fontSize="2xl" fontWeight="bold" mb={1}>
        Perfil
      </Text>
      <Text color="gray.500" fontSize="sm" mb={6}>
        Centralize seus dados, seguranca e enderecos em um unico lugar.
      </Text>

      <Tabs variant="enclosed">
        <TabList>
          <Tab>Cadastro</Tab>
          <Tab>Seguranca</Tab>
          <Tab>Enderecos</Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0} pt={6}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>Nome</FormLabel>
                <Input value={user?.nome ?? ''} isReadOnly />
              </FormControl>

              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input value={user?.email ?? ''} isReadOnly />
              </FormControl>

              <FormControl>
                <FormLabel>Nome fantasia</FormLabel>
                <Input value={representanteNomeFantasia ?? ''} isReadOnly />
              </FormControl>

              <FormControl>
                <FormLabel>Razao social</FormLabel>
                <Input value={representanteRazaoSocial ?? ''} isReadOnly />
              </FormControl>
            </SimpleGrid>

            <Text color="gray.500" fontSize="sm" mt={4}>
              Para alterar dados cadastrais, entre em contato com o suporte.
            </Text>
          </TabPanel>

          <TabPanel px={0} pt={6}>
            <Alert status="info" variant="left-accent" mb={4}>
              <AlertIcon />
              Atualizacao de senha ainda nao esta disponivel neste portal.
            </Alert>

            <Box as="form" onSubmit={handlePasswordSubmit}>
              <Stack spacing={4} maxW="md">
                <FormControl>
                  <FormLabel>Senha atual</FormLabel>
                  <Input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      handlePasswordChange('currentPassword', event.target.value)
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Nova senha</FormLabel>
                  <Input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      handlePasswordChange('newPassword', event.target.value)
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Confirmar nova senha</FormLabel>
                  <Input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      handlePasswordChange('confirmPassword', event.target.value)
                    }
                  />
                </FormControl>

                <Button type="submit" colorScheme="brand" alignSelf="flex-start">
                  Salvar nova senha
                </Button>
              </Stack>
            </Box>
          </TabPanel>

          <TabPanel px={0} pt={6}>
            <AddressesPage />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
