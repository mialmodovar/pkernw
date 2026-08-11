from django.contrib.auth.models import User
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Profile
from .serializers import AvatarUpdateSerializer, RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_avatar(request):
    serializer = AvatarUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.avatar_emoji = serializer.validated_data["avatar_emoji"]
    profile.save(update_fields=["avatar_emoji"])

    return Response({"avatar_emoji": profile.avatar_emoji}, status=status.HTTP_200_OK)
